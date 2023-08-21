/*
 * This file is part of the libav.js WebCodecs Bridge implementation.
 *
 * Copyright (c) 2023 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

/*
 * This file contains functionality related to using libav.js for converting
 * WebCodecs data to libav.js's formats and muxing.
 */

import type * as LibAVJS from "libav.js";
import type * as LibAVJSWebCodecs from "libavjs-webcodecs-polyfill";
declare let LibAVWebCodecs : any;
declare let EncodedAudioChunk : any;
declare let EncodedVideoChunk : any;

/**
 * Convert a WebCodecs audio configuration to stream context sufficient for
 * libav.js, namely codecpar and timebase.
 *
 * @param libav  The libav.js instance that created this stream.
 * @param config  The configuration to convert.
 * @returns [address of codecpar, timebase numerator, timebase denominator]
 */
export async function configToAudioStream(
    libav: LibAVJS.LibAV, config: LibAVJSWebCodecs.AudioEncoderConfig
): Promise<[number, number, number]> {
    const codecLong = config.codec;
    let codec: string;
    if (typeof codecLong === "object")
        codec = codecLong.libavjs.codec;
    else
        codec = codec.replace(/\..*/, "");

    // Convert the codec to a libav name
    switch (codec) {
        case "mp4a": codec = "aac"; break;
        case "pcm-u8": codec = "pcm_u8"; break;
        case "pcm-s16": codec = "pcm_s16le"; break;
        case "pcm-s24": codec = "pcm_s24le"; break;
        case "pcm-s32": codec = "pcm_s32le"; break;
        case "pcm-f32": codec = "pcm_f32le"; break;
    }

    // Find the associated codec
    const desc = await libav.avcodec_descriptor_get_by_name(codec);

    // Make the codecpar
    const codecpar = await libav.avcodec_parameters_alloc();
    if (desc) {
        await libav.AVCodecParameters_codec_type_s(codecpar,
            await libav.AVCodecDescriptor_type(desc));
        await libav.AVCodecParameters_codec_id_s(codecpar,
            await libav.AVCodecDescriptor_id(desc));
        if (config.sampleRate) {
            await libav.AVCodecParameters_sample_rate_s(codecpar,
                config.sampleRate);
        }
        if (config.numberOfChannels) {
            await libav.AVCodecParameters_channels_s(codecpar,
                config.numberOfChannels);
        }
    }

    // And the timebase
    let timebaseNum = 1, timebaseDen = 1000;
    if (config.sampleRate)
        timebaseDen = config.sampleRate;

    return [codecpar, timebaseNum, timebaseDen];
}

/**
 * Convert a WebCodecs video configuration to stream context sufficient for
 * libav.js, namely codecpar and timebase.
 *
 * @param libav  The libav.js instance that created this stream.
 * @param config  The configuration to convert.
 * @returns [address of codecpar, timebase numerator, timebase denominator]
 */
export async function configToVideoStream(
    libav: LibAVJS.LibAV, config: LibAVJSWebCodecs.VideoEncoderConfig
): Promise<[number, number, number]> {
    const codecLong = config.codec;
    let codec: string;
    if (typeof codecLong === "object")
        codec = codecLong.libavjs.codec;
    else
        codec = codec.replace(/\..*/, "");

    // Convert the codec to a libav name
    switch (codec) {
        case "av01": codec = "av1"; break;
        case "avc1":
        case "avc3":
            codec = "h264";
            break;
        case "hev1":
        case "hvc1":
            codec = "hevc";
            break;
        case "vp09": codec = "vp9"; break;
    }

    // Find the associated codec
    const desc = await libav.avcodec_descriptor_get_by_name(codec);

    // Make the codecpar
    const codecpar = await libav.avcodec_parameters_alloc();
    if (desc) {
        await libav.AVCodecParameters_codec_type_s(codecpar,
            await libav.AVCodecDescriptor_type(desc));
        await libav.AVCodecParameters_codec_id_s(codecpar,
            await libav.AVCodecDescriptor_id(desc));
        await libav.AVCodecParameters_width_s(codecpar, config.width);
        await libav.AVCodecParameters_height_s(codecpar, config.height);
        // FIXME: Use displayWidth and displayHeight to make SAR
    }

    // And the timebase
    let timebaseNum = 1, timebaseDen = 1000;
    if (config.framerate) {
        // Simple if it's an integer
        if (config.framerate === ~~config.framerate) {
            timebaseDen = config.framerate;
        } else {
            /* Need to find an integer ratio. First try 1001, as many common
             * framerates are x/1001 */
            const fr1001 = config.framerate * 1001;
            if (fr1001 === ~~fr1001) {
                timebaseNum = 1001;
                timebaseDen = fr1001;
            } else {
                /* Just look for a power of two. This will always work because
                 * of how floating point works. */
                timebaseDen = config.framerate;
                while (timebaseDen !== Math.floor(timebaseDen)) {
                    timebaseNum *= 2;
                    timebaseDen *= 2;
                }
            }
        }
    }

    return [codecpar, timebaseNum, timebaseDen];
}

/*
 * Convert the timestamp and duration from microseconds to an arbitrary timebase
 * given by libav.js (internal)
 */
function times(chunk: LibAVJSWebCodecs.EncodedVideoChunk, stream: [number, number, number]) {
    const num = stream[1];
    const den = stream[2];
    return {
        timestamp: Math.round(chunk.timestamp * den / num / 1000000),
        duration: Math.round(chunk.duration * den / num / 1000000)
    };
}

/*
 * Convert a WebCodecs Encoded{Audio,Video}Chunk to a libav.js packet for muxing. Internal.
 */
function encodedChunkToPacket(
    chunk: LibAVJSWebCodecs.EncodedAudioChunk | LibAVJSWebCodecs.EncodedVideoChunk,
    stream: [number, number, number], streamIndex: number
): LibAVJS.Packet {
    const {timestamp, duration} = times(chunk, stream);

    // Convert into high and low bits
    let pts = timestamp;
    let ptshi = 0;
    if (pts >= 0x100000000) {
        ptshi = Math.floor(pts / 0x100000000);
        pts = pts % 0x100000000;
    }
    let dur = duration;
    let durhi = 0;
    if (dur >= 0x100000000) {
        durhi = Math.floor(dur / 0x100000000);
        dur = dur % 0x100000000;
    }

    // Create a buffer for it
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data.buffer);

    // And make a packet
    return {
        data,
        pts, ptshi,
        dts: pts, dtshi: ptshi,
        stream_index: streamIndex,
        flags: 0,
        duration: dur, durationhi: durhi
    };
}

/**
 * Convert a WebCodecs EncodedAudioChunk to a libav.js packet for muxing.
 * @param chunk  The chunk itself.
 * @param stream  The stream this packet belongs to (necessary for timestamp conversion).
 * @param streamIndex  The stream index to inject into the packet
 */
export function encodedAudioChunkToPacket(
    chunk: LibAVJSWebCodecs.EncodedAudioChunk, stream: [number, number, number], streamIndex: number
): LibAVJS.Packet {
    return encodedChunkToPacket(chunk, stream, streamIndex);
}

/**
 * Convert a WebCodecs EncodedVideoChunk to a libav.js packet for muxing.
 * @param chunk  The chunk itself.
 * @param stream  The stream this packet belongs to (necessary for timestamp conversion).
 * @param streamIndex  The stream index to inject into the packet
 */
export function encodedVideoChunkToPacket(
    chunk: LibAVJSWebCodecs.EncodedVideoChunk, stream: [number, number, number], streamIndex: number
): LibAVJS.Packet {
    const ret = encodedChunkToPacket(chunk, stream, streamIndex);
    if (chunk.type === "key")
        ret.flags = 1;
    return ret;
}

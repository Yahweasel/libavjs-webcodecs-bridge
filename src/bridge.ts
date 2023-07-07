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

import type * as LibAVJS from "libav.js";
import type * as LibAVJSWebCodecs from "libavjs-webcodecs-polyfill";
declare let LibAVWebCodecs : any;

/**
 * Convert a libav.js stream to a WebCodecs configuration.
 *
 * @param libav  The libav.js instance that created this stream.
 * @param stream  The stream to convert.
 */
export async function streamToConfig(
    libav: LibAVJS.LibAV, stream: LibAVJS.Stream
): Promise<LibAVJSWebCodecs.AudioDecoderConfig | LibAVJSWebCodecs.VideoDecoderConfig> {
    switch (stream.codec_type) {
        case libav.AVMEDIA_TYPE_AUDIO:
            return audioStreamToConfig(libav, stream);

        case libav.AVMEDIA_TYPE_VIDEO:
            return videoStreamToConfig(libav, stream);

        default:
            return null;
    }
}

/**
 * Convert a libav.js audio stream to a WebCodecs configuration.
 *
 * @param libav  The libav.js instance that created this stream.
 * @param stream  The stream to convert.
 */
export async function audioStreamToConfig(
    libav: LibAVJS.LibAV, stream: LibAVJS.Stream
): Promise<LibAVJSWebCodecs.AudioDecoderConfig> {
    const codecString = await libav.avcodec_get_name(stream.codec_id);

    // Start with the basics
    const ret: LibAVJSWebCodecs.AudioDecoderConfig = {
        codec: null,
        sampleRate: await libav.AVCodecParameters_sample_rate(stream.codecpar),
        numberOfChannels: await libav.AVCodecParameters_channels(stream.codecpar)
    };

    // Get the extradata
    const extradataPtr = await libav.AVCodecParameters_extradata(stream.codecpar);
    let extradata: Uint8Array = null;
    if (extradataPtr) {
        const edSize = await libav.AVCodecParameters_extradata_size(stream.codecpar);
        extradata = await libav.copyout_u8(extradataPtr, edSize);
    }

    // Then convert the actual codec
    switch (codecString) {
        case "flac":
            ret.codec = "flac";
            ret.description = extradata;
            break;

        case "mp3":
            ret.codec = "mp3";
            break;

        case "aac":
        {
            const profile = await libav.AVCodecParameters_profile(stream.codecpar);
            switch (profile) {
                case 1: // AAC_LOW
                    ret.codec = "mp4a.40.2";
                    break;

                case 4: // AAC_HE
                    ret.codec = "mp4a.40.5";
                    break;

                case 28: // AAC_HE_V2
                    ret.codec = "mp4a.40.29";
                    break;
            }
            if (extradata)
                ret.description = extradata;
            break;
        }

        case "opus":
            ret.codec = "opus";
            break;

        case "vorbis":
            ret.codec = "vorbis";
            ret.description = extradata;
            break;

        default:
            // Best we can do is a libavjs-webcodecs-polyfill-specific config
            if (typeof LibAVWebCodecs !== "undefined") {
                ret.codec = {libavjs:{
                    codec: codecString,
                    ctx: {
                        channels: await libav.AVCodecParameters_channels(stream.codecpar),
                        sample_rate: await libav.AVCodecParameters_sample_rate(stream.codecpar)
                    }
                }};
                if (extradata)
                    ret.description = extradata;
            }
            break;
    }

    if (ret.codec)
        return ret;
    return null;
}

/**
 * Convert a libav.js video stream to a WebCodecs configuration.
 *
 * @param libav  The libav.js instance that created this stream.
 * @param stream  The stream to convert.
 */
export async function videoStreamToConfig(
    libav: LibAVJS.LibAV, stream: LibAVJS.Stream
): Promise<LibAVJSWebCodecs.VideoDecoderConfig> {
    const codecString = await libav.avcodec_get_name(stream.codec_id);

    // Start with the basics
    const ret: LibAVJSWebCodecs.VideoDecoderConfig = {
        codec: null,
        codedWidth: await libav.AVCodecParameters_width(stream.codecpar),
        codedHeight: await libav.AVCodecParameters_height(stream.codecpar)
    };

    // Get the extradata
    const extradataPtr = await libav.AVCodecParameters_extradata(stream.codecpar);
    let extradata: Uint8Array = null;
    if (extradataPtr) {
        const edSize = await libav.AVCodecParameters_extradata_size(stream.codecpar);
        extradata = await libav.copyout_u8(extradataPtr, edSize);
    }

    // Then convert the actual codec
    switch (codecString) {
        default:
            // Best we can do is a libavjs-webcodecs-polyfill-specific config
            if (typeof LibAVWebCodecs !== "undefined") {
                ret.codec = {libavjs:{
                    codec: codecString,
                    ctx: {
                        channels: await libav.AVCodecParameters_channels(stream.codecpar),
                        sample_rate: await libav.AVCodecParameters_sample_rate(stream.codecpar)
                    }
                }};
                if (extradata)
                    ret.description = extradata;
            }
            break;
    }

    if (ret.codec)
        return ret;
    return null;
}

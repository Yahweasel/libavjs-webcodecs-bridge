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
 * This file contains functionality related to using libav.js for demuxing, and
 * then converting everything to WebCodecs for decoding.
 */

import type * as LibAVJS from "libav.js";
import type * as LibAVJSWebCodecs from "libavjs-webcodecs-polyfill";
declare let LibAVWebCodecs : any;
declare let EncodedAudioChunk : any;
declare let EncodedVideoChunk : any;

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

    // Some commonly needed data
    let profile = await libav.AVCodecParameters_profile(stream.codecpar);
    let level = await libav.AVCodecParameters_level(stream.codecpar);

    // Then convert the actual codec
    switch (codecString) {
        case "av1":
        {
            let codec = "av01";

            // <profile>
            codec += `.0${profile}`;

            // <level><tier>
            let levelS = level.toString();
            if (levelS.length < 2)
                levelS = `0${level}`;
            const tier = "M"; // FIXME: Is this exposed by ffmpeg?
            codec += `.${levelS}${tier}`;

            // <bitDepth>
            const format = await libav.AVCodecParameters_format(stream.codecpar);
            const desc = await libav.av_pix_fmt_desc_get(format);
            let bitDepth = (await libav.AVPixFmtDescriptor_comp_depth(desc, 0)).toString();
            if (bitDepth.length < 2)
                bitDepth = `0${bitDepth}`;
            codec += `.${bitDepth}`;

            // <monochrome>
            const nbComponents = await libav.AVPixFmtDescriptor_nb_components(desc);
            if (nbComponents < 2)
                codec += ".1";
            else
                codec += ".0";

            // .<chromaSubsampling>
            let subX = 0, subY = 0, subP = 0;
            if (nbComponents < 2) {
                // Monochrome is always considered subsampled (weirdly)
                subX = 1;
                subY = 1;
            } else {
                subX = await libav.AVPixFmtDescriptor_log2_chroma_w(desc);
                subY = await libav.AVPixFmtDescriptor_log2_chroma_h(desc);
                /* FIXME: subP (subsampling position) mainly represents the
                 * *vertical* position, which doesn't seem to be exposed by
                 * ffmpeg, at least not in a usable way */
            }
            codec += `.${subX}${subY}${subP}`;

            // FIXME: the rest are technically optional, so left out
            ret.codec = codec;
            break;
        }

        case "h264": // avc1
        {
            let codec = "avc1";

            // Technique extracted from hlsenc.c
            if (extradata &&
                (extradata[0] | extradata[1] | extradata[2]) === 0 &&
                extradata[3] === 1 &&
                (extradata[4] & 0x1F) === 7) {
                codec += ".";
                for (let i = 5; i <= 7; i++) {
                    let s = extradata[i].toString(16);
                    if (s.length < 2)
                        s = "0" + s;
                    codec += s;
                }

            } else {
                // Do it from the stream data alone

                // <profile>
                if (profile < 0)
                    profile = 77;
                const profileB = profile & 0xFF;
                let profileS = profileB.toString(16);
                if (profileS.length < 2)
                    profileS = `0${profileS}`;
                codec += `.${profileS}`;

                // <a nonsensical byte with some constraints and some reserved 0s>
                let constraints = 0;
                if (profile & 0x100 /* FF_PROFILE_H264_CONSTRAINED */) {
                    // One or more of the constraint bits should be set
                    if (profileB === 66 /* FF_PROFILE_H264_BASELINE */) {
                        // All three
                        constraints |= 0xE0;
                    } else if (profileB === 77 /* FF_PROFILE_H264_MAIN */) {
                        // Only constrained to main
                        constraints |= 0x60;
                    } else if (profile === 88 /* FF_PROFILE_H264_EXTENDED */) {
                        // Only constrained to extended
                        constraints |= 0x20;
                    } else {
                        // Constrained, but we don't understand how
                        break;
                    }
                }
                let constraintsS = constraints.toString(16);
                if (constraintsS.length < 2)
                    constraintsS = `0${constraintsS}`;
                codec += constraintsS;

                // <level>
                if (level < 0)
                    level = 10;
                let levelS = level.toString(16);
                if (levelS.length < 2)
                    levelS = `0${levelS}`;
                codec += levelS;
            }

            ret.codec = codec;
            if (extradata && extradata[0])
                ret.description = extradata;
            break;
        }

        case "hevc": // hev1/hvc1
        {
            let codec;

            if (extradata && extradata.length > 12) {
                codec = "hvc1";
                const dv = new DataView(extradata.buffer);
                ret.description = extradata;

                // Extrapolated from MP4Box.js
                codec += ".";
                const profileSpace = extradata[1] >> 6;
                switch (profileSpace) {
                    case 1: codec += "A"; break;
                    case 2: codec += "B"; break;
                    case 3: codec += "C"; break;
                }

                const profileIDC = extradata[1] & 0x1F;
                codec += profileIDC + ".";

                const profileCompatibility = dv.getUint32(2);
                let val = profileCompatibility;
                let reversed = 0;
                for (let i = 0; i < 32; i++) {
                    reversed |= val & 1;
                    if (i === 31) break;
                    reversed <<= 1;
                    val >>= 1;
                }
                codec += reversed.toString(16) + ".";

                const tierFlag = (extradata[1] & 0x20) >> 5;
                if (tierFlag === 0)
                    codec += 'L';
                else
                    codec += 'H';

                const levelIDC = extradata[12];
                codec += levelIDC;

                let constraintString = "";
                for (let i = 11; i >= 6; i--) {
                    const b = extradata[i];
                    if (b || constraintString)
                        constraintString = "." + b.toString(16) + constraintString;
                }
                codec += constraintString;

            } else {
                /* NOTE: This string was extrapolated from hlsenc.c, but is clearly
                 * not valid for every possible H.265 stream. */
                codec = `hev1.${profile}.4.L${level}.B01`;

            }

            ret.codec = codec;
            break;
        }

        case "vp8":
            ret.codec = "vp8";
            break;

        case "vp9":
        {
            let codec = "vp09";

            // <profile>
            let profileS = profile.toString();
            if (profile < 0)
                profileS = "00";
            if (profileS.length < 2)
                profileS = `0${profileS}`;
            codec += `.${profileS}`;

            // <level>
            let levelS = level.toString();
            if (level < 0)
                levelS = "10";
            if (levelS.length < 2)
                levelS = `0${levelS}`;
            codec += `.${levelS}`;

            // <bitDepth>
            const format = await libav.AVCodecParameters_format(stream.codecpar);
            const desc = await libav.av_pix_fmt_desc_get(format);
            let bitDepth = (await libav.AVPixFmtDescriptor_comp_depth(desc, 0)).toString();
            if (bitDepth === "0")
                bitDepth = "08";
            if (bitDepth.length < 2)
                bitDepth = `0${bitDepth}`;
            codec += `.${bitDepth}`;

            // <chromaSubsampling>
            const subX = await libav.AVPixFmtDescriptor_log2_chroma_w(desc);
            const subY = await libav.AVPixFmtDescriptor_log2_chroma_h(desc);
            let chromaSubsampling = 0;
            if (subX > 0 && subY > 0) {
                chromaSubsampling = 1; // YUV420
            } else if (subX > 0 || subY > 0) {
                chromaSubsampling = 2; // YUV422
            } else {
                chromaSubsampling = 3; // YUV444
            }
            codec += `.0${chromaSubsampling}`;

            codec += ".1.1.1.0";

            ret.codec = codec;
            break;
        }

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

/*
 * Convert the timestamp and duration from a libav.js packet to microseconds for
 * WebCodecs.
 */
function times(packet: LibAVJS.Packet, stream: LibAVJS.Stream) {
    // Convert the duration
    let pDuration = packet.durationhi * 0x100000000 + packet.duration;
    if (pDuration <= 0)
        pDuration = 1;
    const duration = Math.round(
        pDuration * stream.time_base_num / stream.time_base_den * 1000000
    );

    // Convert the timestamp
    let pts = packet.ptshi * 0x100000000 + packet.pts;
    if (pts < 0)
        pts = 0;
    let timestamp = Math.round(
        pts * stream.time_base_num / stream.time_base_den * 1000000
    );

    return {timestamp, duration};
}

/**
 * Convert a libav.js audio packet to a WebCodecs EncodedAudioChunk.
 * @param packet  The packet itself.
 * @param stream  The stream this packet belongs to (necessary for timestamp conversion).
 * @param opts  Extra options. In particular, if using a polyfill, you can set
 *              the EncodedAudioChunk constructor here.
 */
export function packetToEncodedAudioChunk(
    packet: LibAVJS.Packet, stream: LibAVJS.Stream, opts: {
        EncodedAudioChunk?: any
    } = {}
): LibAVJSWebCodecs.EncodedAudioChunk {
    let EAC: any;
    if (opts.EncodedAudioChunk)
        EAC = opts.EncodedAudioChunk;
    else
        EAC = EncodedAudioChunk;

    const {timestamp, duration} = times(packet, stream);

    return new EAC({
        type: "key", // all audio chunks are keyframes in all audio codecs
        timestamp,
        duration,
        data: packet.data.buffer
    });
}

/**
 * Convert a libav.js video packet to a WebCodecs EncodedVideoChunk.
 * @param packet  The packet itself.
 * @param stream  The stream this packet belongs to (necessary for timestamp conversion).
 * @param opts  Extra options. In particular, if using a polyfill, you can set
 *              the EncodedVideoChunk constructor here.
 */
export function packetToEncodedVideoChunk(
    packet: LibAVJS.Packet, stream: LibAVJS.Stream, opts: {
        EncodedVideoChunk?: any
    } = {}
): LibAVJSWebCodecs.EncodedVideoChunk {
    let EVC: any;
    if (opts.EncodedVideoChunk)
        EVC = opts.EncodedVideoChunk;
    else
        EVC = EncodedVideoChunk;

    const {timestamp, duration} = times(packet, stream);

    return new EVC({
        type: (packet.flags & 1) ? "key" : "delta",
        timestamp,
        duration,
        data: packet.data.buffer
    });
}

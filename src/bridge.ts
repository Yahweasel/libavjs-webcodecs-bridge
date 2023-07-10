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
    const profile = await libav.AVCodecParameters_profile(stream.codecpar);
    const level = await libav.AVCodecParameters_level(stream.codecpar);

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

            // <profile>
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
            let levelS = level.toString(16);
            if (levelS.length < 2)
                levelS = `0${levelS}`;
            codec += levelS;

            ret.codec = codec;

            if (extradata)
                ret.description = extradata;
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
            if (profileS.length < 2)
                profileS = `0${profileS}`;
            codec += `.${profileS}`;

            // <level>
            let levelS = level.toString();
            if (levelS.length < 2)
                levelS = `0${levelS}`;
            codec += `.${levelS}`;

            // <bitDepth>
            const format = await libav.AVCodecParameters_format(stream.codecpar);
            const desc = await libav.av_pix_fmt_desc_get(format);
            let bitDepth = (await libav.AVPixFmtDescriptor_comp_depth(desc, 0)).toString();
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

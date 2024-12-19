/*
 * This file is part of the libav.js WebCodecs Bridge implementation.
 *
 * Copyright (c) 2024 Yahweasel and contributors
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
 * This file contains functionality related to converting libav.js Frames to
 * WebCodecs VideoFrames and AudioDatas.
 */

import type * as LibAVJS from "@libav.js/types";
import * as LibAVJSWebCodecs from "libavjs-webcodecs-polyfill";

declare let VideoFrame: any, AudioData: any;

// (Duplicated from libav.js)
function i64tof64(lo: number, hi: number) {
    // Common positive case
    if (!hi && lo >= 0) return lo;

    // Common negative case
    if (hi === -1 && lo < 0) return lo;

    /* Lo bit negative numbers are really just the 32nd bit being
     * set, so we make up for that with an additional 2^32 */
    return (
        hi * 0x100000000 +
        lo +
        ((lo < 0) ? 0x100000000 : 0)
    );
}

/**
 * Convert a libav.js timestamp to a WebCodecs timestamp.
 * @param lo  Low bits of the timestamp.
 * @param hi  High bits of the timestamp.
 * @param timeBase  Optional timebase to use for conversion.
 */
function laTimeToWCTime(lo: number, hi: number, timeBase?: [number, number]) {
    let ret = i64tof64(lo, hi);
    if (timeBase)
        ret = Math.round(ret * 1000000 * timeBase[0] / timeBase[1]);
    return ret;
}

/**
 * Convert a libav.js Frame to a VideoFrame. If not provided in opts, the
 * libav.js frame is assumed to use the same timebase as WebCodecs, 1/1000000.
 * @param frame  libav.js Frame.
 * @param opts  Optional options, namely a VideoFrame constructor and timebase
 *              to use.
 */
export function laFrameToVideoFrame(
    frame: LibAVJS.Frame, opts: {
        VideoFrame?: any,
        timeBase?: [number, number],
        transfer?: boolean
    } = {}
) {
    let VF: any;
    if (opts.VideoFrame)
        VF = opts.VideoFrame;
    else
        VF = VideoFrame;

    let layout: LibAVJSWebCodecs.PlaneLayout[];
    let data: Uint8Array;
    let transfer: ArrayBuffer[] = [];

    let timeBase = opts.timeBase;
    if (!timeBase && frame.time_base_num)
        timeBase = [frame.time_base_num||1, frame.time_base_den||1000000];

    if (frame.layout) {
        // Modern (libav.js ≥ 5) frame in WebCodecs-like format
        data = frame.data;
        layout = frame.layout;
        if (opts.transfer)
            transfer.push(data.buffer);

    } else {
        // Pre-libavjs-5 frame with one array per row
        // Combine all the frame data into a single object
        layout = [];
        let size = 0;
        for (let p = 0; p < frame.data.length; p++) {
            const plane = frame.data[p];
            layout.push({
                offset: size,
                stride: plane[0].length
            });
            size += plane.length * plane[0].length;
        }
        data = new Uint8Array(size);
        let offset = 0;
        for (let p = 0; p < frame.data.length; p++) {
            const plane = frame.data[p];
            const linesize = plane[0].length;
            for (let y = 0; y < plane.length; y++) {
                data.set(plane[y], offset);
                offset += linesize;
            }
        }
        transfer.push(data.buffer);

    }

    // Choose the format
    let format: LibAVJSWebCodecs.VideoPixelFormat = "I420";
    switch (frame.format) {
        case 0:
            format = "I420";
            break;

        case 33:
            format = "I420A";
            break;

        case 4:
            format = "I422";
            break;

        case 23:
            format = "NV12";
            break;

        case 26:
            format = "RGBA";
            break;

        case 28:
            format = "BGRA";
            break;

        default:
            throw new Error("Unsupported pixel format");
    }

    // And make the VideoFrame
    return new VF(data, {
        format,
        codedWidth: frame.width,
        codedHeight: frame.height,
        timestamp: laTimeToWCTime(frame.pts||0, frame.ptshi||0, timeBase),
        layout,
        transfer
    });
}

/**
 * Convert a libav.js Frame to an AudioData. If not provide din opts, the
 * libav.js frame is assumed to use the same timebase as WebCodecs, 1/1000000.
 * @param frame  libav.js Frame.
 * @param opts  Optional options, namely an AudioData constructor and timebase
 *              to use.
 */
export function laFrameToAudioData(
    frame: LibAVJS.Frame, opts: {
        AudioData?: any,
        timeBase?: [number, number]
    } = {}
) {
    let AD: any;
    if (opts.AudioData)
        AD = opts.AudioData;
    else
        AD = AudioData;

    let timeBase = opts.timeBase;
    if (!timeBase && frame.time_base_num)
        timeBase = [frame.time_base_num||1, frame.time_base_den||1000000];

    // Combine all the frame data into a single object
    let size = 0;
    if ((<any> frame.data).buffer) {
        // Non-planar
        size = (<any> frame.data).byteLength;
    } else {
        // Planar
        for (let p = 0; p < frame.data.length; p++)
            size += frame.data[p].byteLength;
    }
    const data = new Uint8Array(size);
    let offset = 0;
    if ((<any> frame.data).buffer) {
        const rd = <any> frame.data;
        data.set(new Uint8Array(rd.buffer, rd.byteOffset, rd.byteLength));

    } else {
        let offset = 0;
        for (let p = 0; p < frame.data.length; p++) {
            const rp = frame.data[p];
            const plane = new Uint8Array(rp.buffer, rp.byteOffset, rp.byteLength);
            data.set(plane, offset);
            offset += plane.length;
        }
    }

    // Choose the format
    let format: LibAVJSWebCodecs.AudioSampleFormat = "s16";
    switch (frame.format) {
        case 0: format = "u8"; break;
        case 1: format = "s16"; break;
        case 2: format = "s32"; break;
        case 3: format = "f32"; break;
        case 5: format = "u8-planar"; break;
        case 6: format = "s16-planar"; break;
        case 7: format = "s32-planar"; break;
        case 8: format = "f32-planar"; break;

        default:
            throw new Error("Unsupported sample format");
    }

    // And make the AudioData
    return new AD({
        format,
        data,
        sampleRate: frame.sample_rate,
        numberOfFrames: frame.nb_samples,
        numberOfChannels: frame.channels,
        timestamp: laTimeToWCTime(frame.pts||0, frame.ptshi||0, timeBase)
    });
}

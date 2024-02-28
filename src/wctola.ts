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
 * This file contains functionality related to converting WebCodecs VideoFrames
 * and AudioDatas to libav.js Frames.
 */

import type * as LibAVJS from "libav.js";
import type * as LibAVJSWebCodecs from "libavjs-webcodecs-polyfill";

/**
 * Convert a VideoFrame to a libav.js Frame. The libav.js frame will use the
 * same timebase as WebCodecs, 1/1000000.
 * @param frame  VideoFrame to convert.
 */
export async function videoFrameToLAFrame(frame: LibAVJSWebCodecs.VideoFrame) {
    // First just naively extract all the data
    const data = new Uint8Array(frame.allocationSize());
    await frame.copyTo(data);

    // Then figure out how that corresponds to planes
    let libavFormat = 5, bpp = 1, planes = 3, cwlog2 = 0, chlog2 = 0;
    switch (frame.format) {
        case "I420":
            libavFormat = 0;
            cwlog2 = chlog2 = 1;
            break;

        case "I420A":
            libavFormat = 33;
            planes = 4;
            cwlog2 = chlog2 = 1;
            break;

        case "I422":
            libavFormat = 4;
            cwlog2 = 1;
            break;

        case "NV12":
            libavFormat = 23;
            planes = 2;
            chlog2 = 1;
            break;

        case "RGBA":
        case "RGBX":
            libavFormat = 26;
            planes = 1;
            bpp = 4;
            break;

        case "BGRA":
        case "BGRX":
            libavFormat = 28;
            planes = 1;
            bpp = 4;
            break;
    }

    // And copy out the data
    const laFrame: LibAVJS.Frame = {
        format: libavFormat,
        data: [],
        pts: ~~frame.timestamp,
        ptshi: Math.floor(frame.timestamp / 0x100000000),
        width: frame.visibleRect.width,
        height: frame.visibleRect.height
    };
    let offset = 0;
    for (let p = 0; p < planes; p++) {
        const plane: Uint8Array[] = [];
        laFrame.data.push(plane);
        let wlog2 = 0, hlog2 = 0;
        if (p === 1 || p === 2) {
            wlog2 = cwlog2;
            hlog2 = chlog2;
        }
        for (let y = 0; y < frame.visibleRect.height >>> hlog2; y++) {
            const w = (frame.visibleRect.width * bpp) >>> wlog2;
            plane.push(data.subarray(offset, offset + w));
            offset += w;
        }
    }

    return laFrame;
}

/**
 * Convert an AudioData to a libav.js Frame. The libav.js frame will use the
 * same timebase as WebCodecs, 1/1000000.
 * @param frame  AudioFrame to convert.
 */
export async function audioDataToLAFrame(frame: LibAVJSWebCodecs.AudioData) {
    // Figure out how the data corresponds to frames
    let libavFormat = 6;
    let TypedArray: any = Int16Array;
    const planar = /-planar$/.test(frame.format);
    switch (frame.format) {
        case "u8":
        case "u8-planar":
            libavFormat = planar ? 5 : 0;
            TypedArray = Uint8Array;
            break;

        case "s16":
        case "s16-planar":
            libavFormat = planar ? 6 : 1;
            break;

        case "s32":
        case "s32-planar":
            libavFormat = planar ? 7 : 2;
            TypedArray = Int32Array;
            break;

        case "f32":
        case "f32-planar":
            libavFormat = planar ? 8 : 3;
            TypedArray = Float32Array;
            break;
    }

    // And copy out the data
    const laFrame: LibAVJS.Frame = {
        format: libavFormat,
        data: null,
        pts: ~~frame.timestamp,
        ptshi: Math.floor(frame.timestamp / 0x100000000),
        sample_rate: frame.sampleRate,
        nb_samples: frame.numberOfFrames,
        channels: frame.numberOfChannels
    };
    if (planar) {
        laFrame.data = [];
        for (let p = 0; p < frame.numberOfChannels; p++) {
            const plane = new TypedArray(frame.numberOfFrames);
            laFrame.data.push(plane);
            await frame.copyTo(plane.buffer, {planeIndex: p, format: frame.format});
        }
    } else {
        const data = laFrame.data = new TypedArray(frame.numberOfFrames * frame.numberOfChannels);
        await frame.copyTo(data.buffer, {planeIndex: 0, format: frame.format});
    }

    return laFrame;
}

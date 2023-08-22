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
 * This is the main entry point and simply exposes the interfaces provided by
 * other components.
 */

import * as demux from "./demux";
import * as mux from "./mux";

export const audioStreamToConfig = demux.audioStreamToConfig;
export const videoStreamToConfig = demux.videoStreamToConfig;
export const packetToEncodedAudioChunk = demux.packetToEncodedAudioChunk;
export const packetToEncodedVideoChunk = demux.packetToEncodedVideoChunk;

export const configToAudioStream = mux.configToAudioStream;
export const configToVideoStream = mux.configToVideoStream;
export const encodedAudioChunkToPacket = mux.encodedAudioChunkToPacket;
export const encodedVideoChunkToPacket = mux.encodedVideoChunkToPacket;

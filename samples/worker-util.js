/*
 * This (un)license applies only to this sample code, and not to
 * libavjs-webcodecs-bridge as a whole:
 *
 * This is free and unencumbered software released into the public domain.
 *
 * Anyone is free to copy, modify, publish, use, compile, sell, or distribute
 * this software, either in source code form or as a compiled binary, for any
 * purpose, commercial or non-commercial, and by any means.
 *
 * In jurisdictions that recognize copyright laws, the author or authors of
 * this software dedicate any and all copyright interest in the software to the
 * public domain. We make this dedication for the benefit of the public at
 * large and to the detriment of our heirs and successors. We intend this
 * dedication to be an overt act of relinquishment in perpetuity of all present
 * and future rights to this software under copyright law.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
 * ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

if (typeof importScripts !== "undefined") {
    LibAV = {base: "https://unpkg.com/libav.js@4.3.6/dist"};
    importScripts(LibAV.base + "/libav-4.3.6.0-webcodecs.js");
    importScripts("../../libavjs-webcodecs-bridge.js");
}

async function sampleDemux(file) {
    /* NOTE: noworker is not mandatory (this is in a worker, so it's fine)! */
    const libav = await LibAV.LibAV({noworker: true});
    await libav.mkreadaheadfile("input", file);

    const [fmt_ctx, streams] = await libav.ff_init_demuxer_file("input");

    const configs = await Promise.all(streams.map(stream => {
        if (stream.codec_type === libav.AVMEDIA_TYPE_AUDIO)
            return LibAVWebCodecsBridge.audioStreamToConfig(libav, stream);
        else if (stream.codec_type === libav.AVMEDIA_TYPE_VIDEO)
            return LibAVWebCodecsBridge.videoStreamToConfig(libav, stream);
        else
            return null;
    }));

    const pkt = await libav.av_packet_alloc();
    const [, packets] = await libav.ff_read_multi(fmt_ctx, pkt);

    libav.terminate();

    return [streams, configs, packets];
}

async function sampleMux(filename, codec, packets, extradata) {
    const libavPackets = [];
    for (const packet of packets) {
        const ab = new ArrayBuffer(packet.byteLength);
        packet.copyTo(ab);
        const pts = ~~(packet.timestamp / 1000);
        libavPackets.push({
            data: new Uint8Array(ab),
            pts, ptshi: 0,
            dts: pts, dtshi: 0,
            flags: (packet.type === "key") ? 1 : 0
        });
    }

    const libav = await LibAV.LibAV({noworker: true});

    /* Decode a little bit (and use extradata) just to make sure everything
     * necessary for a header is in place */
    let [, c, pkt, frame] = await libav.ff_init_decoder(codec);
    await libav.AVCodecContext_time_base_s(c, 1, 1000);
    await libav.ff_decode_multi(c, pkt, frame, [libavPackets[0]]);
    if (extradata) {
        const extradataPtr = await libav.malloc(extradata.length);
        await libav.copyin_u8(extradataPtr, extradata);
        await libav.AVCodecContext_extradata_s(c, extradataPtr);
        await libav.AVCodecContext_extradata_size_s(c, extradata.length);
    }

    // Now mux it
    const [oc, , pb] = await libav.ff_init_muxer(
        {filename, open: true}, [[c, 1, 1000]]);
    await libav.avformat_write_header(oc, 0);
    await libav.ff_write_multi(oc, pkt, libavPackets);
    await libav.av_write_trailer(oc);
    await libav.ff_free_muxer(oc, pb);
    const ret = await libav.readFile(filename);
    libav.terminate();
    return ret;
}

async function decodeAudio(init, packets, stream) {
    // Feed them into the decoder
    const decoder = new AudioDecoder({
        output: frame => {
            const copyOpts = {
                planeIndex: 0,
                format: "f32-planar"
            };
            const ab = new ArrayBuffer(frame.allocationSize(copyOpts));
            frame.copyTo(ab, copyOpts);
            postMessage({c: "frame", idx: stream.index, a: true, frame: ab}, [ab]);
            frame.close();
        },
        error: x => console.error
    });
    decoder.configure(init);
    for (const packet of packets) {
        const eac = LibAVWebCodecsBridge.packetToEncodedAudioChunk(packet, stream);
        decoder.decode(eac);
    }

    // Wait for it to finish
    await decoder.flush();
    decoder.close();

    // And output
    const out = [];
    const copyOpts = {
        planeIndex: 0,
        format: "f32-planar"
    };
    for (const frame of frames) {
        const ab = new ArrayBuffer(frame.allocationSize(copyOpts));
        frame.copyTo(ab, copyOpts);
        out.push(new Float32Array(ab));
    }

    return out;
}

async function decodeVideo(init, packets, stream) {
    // Feed them into the decoder
    let frameP = Promise.all([]);
    const decoder = new VideoDecoder({
        output: frame => {
            frameP = frameP.then(async function() {
                const ib = await createImageBitmap(frame);
                postMessage({c: "frame", idx: stream.index, v: true, frame: ib}, [ib]);
                frame.close();
            }).catch(console.error);
        },
        error: x => console.error
    });
    decoder.configure(init);

    let dequeueRes = null;
    decoder.addEventListener("dequeue", () => {
        if (dequeueRes) {
            const dr = dequeueRes;
            dequeueRes = null;
            dr();
        }
    });

    for (const packet of packets) {
        const evc = LibAVWebCodecsBridge.packetToEncodedVideoChunk(packet, stream);
        decoder.decode(evc);
        while (decoder.decodeQueueSize)
            await new Promise(res => dequeueRes = res);
        await new Promise(res => setTimeout(res, 0));
    }

    // Wait for it to finish
    await decoder.flush();
    await frameP;
    decoder.close();
}

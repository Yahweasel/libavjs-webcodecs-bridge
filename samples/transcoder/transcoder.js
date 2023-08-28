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

importScripts("../worker-util.js");

onmessage = async ev => {
    const file = ev.data;
    let streams, configs, allPackets;

    // Demux the file
    try {
        [streams, configs, allPackets] =
            await sampleDemux(file, {unify: true});
    } catch (ex) {
        console.error(ex);
        return;
    }

    // Prepare for transcoding
    const libav = await LibAV.LibAV({noworker: true});
    let outStreams = [];
    let decoders = new Array(streams.length);
    let oc, pb, pkt;
    let transcodePromise = Promise.all([]);
    for (let si = 0; si < streams.length; si++) {
        const inStream = streams[si];
        if (inStream.codec_type === 0 /* video */) {
            // ENCODING
            const oi = outStreams.length;
            const enc = new VideoEncoder({
                output: (chunk, metadata) => {
                    transcodePromise = transcodePromise.then(async () => {
                        const packet =
                            await LibAVWebCodecsBridge.encodedVideoChunkToPacket(
                                libav, chunk, metadata, outStreams[oi].stream, oi);
                        await libav.ff_write_multi(oc, pkt, [packet]);
                    });
                },
                error: err => {
                    console.error(`video encoder ${oi}: ${err.toString()}`);
                }
            });
            const config = {
                codec: "vp8",
                width: configs[si].codedWidth,
                height: configs[si].codedHeight
            };
            enc.configure(config);
            const stream = await LibAVWebCodecsBridge.configToVideoStream(
                libav, config);

            // DECODING
            const dec = new VideoDecoder({
                output: frame => {
                    enc.encode(frame);
                    frame.close();
                },
                error: err => {
                    console.error(`video decoder ${oi}: ${err.toString()}`);
                }
            });
            decoders[si] = dec;
            dec.configure(configs[si]);

            outStreams.push({
                inIdx: si,
                type: "video",
                encoder: enc,
                config,
                stream,
                decoder: dec
            });

        } else if (inStream.codec_type === 1 /* audio */) {
            // ENCODING
            const oi = outStreams.length;
            const enc = new AudioEncoder({
                output: (chunk, metadata) => {
                    transcodePromise = transcodePromise.then(async () => {
                        const packet =
                            await LibAVWebCodecsBridge.encodedAudioChunkToPacket(
                                libav, chunk, metadata, outStreams[oi].stream, oi);
                        await libav.ff_write_multi(oc, pkt, [packet]);
                    });
                },
                error: err => {
                    console.error(`audio encoder ${oi}: ${err.toString()}`);
                }
            });
            const config = {
                codec: "opus",
                sampleRate: configs[si].sampleRate,
                numberOfChannels: configs[si].numberOfChannels
            };
            enc.configure(config);
            const stream = await LibAVWebCodecsBridge.configToAudioStream(
                libav, config);

            // DECODING
            const dec = new AudioDecoder({
                output: frame => {
                    enc.encode(frame);
                    frame.close();
                },
                error: err => {
                    console.error(`audio decoder ${oi}: ${err.toString()}`);
                }
            });
            decoders[si] = dec;
            dec.configure(configs[si]);

            outStreams.push({
                inIdx: si,
                type: "audio",
                encoder: enc,
                config,
                stream,
                decoder: dec
            });

        }
    }

    // Prepare for muxing
    [oc, , pb] = await libav.ff_init_muxer({
        format_name: "webm",
        filename: "out.webm",
        open: true,
        codecpars: true
    }, outStreams.map(x => x.stream));
    await libav.avformat_write_header(oc, 0);
    pkt = await libav.av_packet_alloc();

    // Transcode
    for (const packet of allPackets[0]) {
        const dec = decoders[packet.stream_index];
        if (!dec)
            continue;
        const inStream = streams[packet.stream_index];
        if (inStream.codec_type === 0 /* video */) {
            dec.decode(LibAVWebCodecsBridge.packetToEncodedVideoChunk(
                packet, inStream));
        } else if (inStream.codec_type === 1 /* audio */) {
            dec.decode(LibAVWebCodecsBridge.packetToEncodedAudioChunk(
                packet, inStream));
        }
    }

    // Flush
    for (const stream of outStreams) {
        await stream.decoder.flush();
        stream.decoder.close();
        await stream.encoder.flush();
        stream.encoder.close();
    }
    await transcodePromise;
    await libav.av_write_trailer(oc);
    await libav.av_packet_free(pkt);
    await libav.ff_free_muxer(oc, pb);

    // Read out the file
    const data = await libav.readFile("out.webm");
    postMessage({c: "chunk", chunk: data});
    libav.terminate();

    postMessage({c: "done"});
};

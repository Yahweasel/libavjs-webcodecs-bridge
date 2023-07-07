(async function() {
    await LibAVWebCodecs.load({
        libavOptions: {noworker: true}
    });

    const [[stream], [init], allPackets] =
        await sampleDemux("../sample1.opus", "opus");
    const packets = allPackets[stream.index];

    const a = await decodeAudio(
        init, packets, stream, LibAVWebCodecs.AudioDecoder,
        LibAVWebCodecs.EncodedAudioChunk);
    let b = null;
    if (typeof AudioDecoder !== "undefined")
        b = await decodeAudio(
            init, packets, stream, AudioDecoder, EncodedAudioChunk);

    await sampleOutputAudio(a);
    if (a && b)
        await sampleCompareAudio(a, b);
})();

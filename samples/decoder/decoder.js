sampleFileInput("file", async function(file, box) {
    let streams, configs, allPackets;

    try {
        [streams, configs, allPackets] =
            await sampleDemux(file);
    } catch (ex) {
        alert(ex + "\n" + ex.stack);
        return;
    }

    for (let idx = 0; idx < streams.length; idx++) {
        const stream = streams[idx];
        const config = configs[idx];
        if (!config)
            continue;
        const packets = allPackets[stream.index];

        try {
            if (stream.codec_type === 0 /* video */) {
                const v = await decodeVideo(config, packets, stream);
                await sampleOutputVideo(v, 25);
            } else if (stream.codec_type === 1 /* audio */) {
                const a = await decodeAudio(config, packets, stream);
                await sampleOutputAudio(a);
            }
        } catch (ex) {
            alert(ex + "\n" + ex.stack);
        }
    }
});

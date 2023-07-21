function sampleFileInput(id, func) {
    const box = document.getElementById(id);
    box.onchange = function() {
        const file = box.files[0];
        if (!file)
            return;
        func(file, box);
    };
}

async function sampleOutputAudio(a) {
    // Quick concat
    const blob = new Blob(a);
    a = new Float32Array(await blob.arrayBuffer());

    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    const w = canvas.width = 1024;
    const h = canvas.height = 64;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    for (let x = 0; x < w; x++) {
        const idx = Math.floor((x / w) * a.length);
        const y = h - (h * Math.abs(a[idx]));
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, 0, 1, y);
        ctx.fillStyle = "#0f0";
        ctx.fillRect(x, y, 1, h - y);
    }
}

function sampleOutputVideo(v, fps) {
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    const w = canvas.width = v[0].width;
    const h = canvas.height = v[0].height;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let idx = 0;
    const interval = setInterval(async () => {
        const image = v[idx++];
        ctx.drawImage(image, 0, 0);

        if (idx >= v.length)
            idx = 0;
    }, Math.round(1000 / fps))
}

libavjs-webcodecs-bridge is a bridge to help you use [libav.js](https://github.com/Yahweasel/libav.js/) and [WebCodecs](https://github.com/w3c/webcodecs) (or
[libavjs-webcodecs-polyfill](https://github.com/ennuicastr/libavjs-webcodecs-polyfill) together.

WebCodecs does not come with demuxers or muxers. libav.js has those as well as
encoders and decoders, but if you have WebCodecs available, you probably should
use them for en/decoding instead of libav.js. That means it's common to demux
with libav.js then decode with WebCodecs, or encode with WebCodecs then mux with
libav.js. But, they don't speak the same language, so to speak.

This bridge bridges the gap. It includes conversions from the various libav.js
types to the equivalent WebCodecs types, and vice-versa.

This project is by the same author as libav.js and libavjs-webcodecs-polyfill.
You do not need libavjs-webcodecs-polyfill to use libavjs-webcodecs-bridge or
vice versa; they have related but orthogonal purposes. For type reasons, this
repository depends on both, but even if you bundle libavjs-webcodecs-bridge,
neither will be included.

libavjs-webcodecs-bridge's API is documented in [API.md](docs/API.md). The demo
in the `demo` directory is a demonstration of start-to-finish transcoding, and
there are some samples in the `samples` directory as well.

libavjs-webcodecs-bridge is a bridge to help you use libav.js and WebCodecs (or
libavjs-webcodecs-polyfill) together.

WebCodecs does not come with demuxers or muxers. libav.js has those as well as
encoders and decoders, but if you have WebCodecs available, you probably should
use them for en/decoding instead of libav.js. That means it's common to demux
with libav.js, then decode with WebCodecs. But, they don't speak the same
language, so to speak.

This bridge bridges the gap. It includes conversions from the various libav.js
types to the equivalent WebCodecs types, and vice-versa.

(Actually, as it's very early, right now it only includes some conversions of
libav.js streams to WebCodecs decoder configurations, but more is on the way.)

This project is by the same author as libav.js and libavjs-webcodecs-polyfill.
You do not need libavjs-webcodecs-polyfill to use libavjs-webcodecs-bridge or
vice versa; they have related but orthogonal purposes.

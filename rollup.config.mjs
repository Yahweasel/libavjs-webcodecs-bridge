import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default {
    input: "src/bridge.js",
    output: [
        {
            file: "dist/libavjs-webcodecs-bridge.js",
            format: "umd",
            name: "LibAVWebCodecsBridge"
        }, {
            file: "dist/libavjs-webcodecs-bridge.min.js",
            format: "umd",
            name: "LibAVWebCodecsBridge"
        }, {
            file: "dist/libavjs-webcodecs-bridge.mjs",
            format: "es"
        }, {
            file: "dist/libavjs-webcodecs-bridge.min.mjs",
            format: "es",
            plugins: [terser()]
        }
    ],
    context: "this",
    plugins: [nodeResolve(), commonjs()]
};

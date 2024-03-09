all: dist/libavjs-webcodecs-bridge.min.js

dist/libavjs-webcodecs-bridge.min.js: src/*.ts node_modules/.bin/tsc
	npm run build

node_modules/.bin/tsc:
	npm install

clean:
	npm run clean

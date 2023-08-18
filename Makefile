all: libavjs-webcodecs-bridge.min.js types/bridge.d.ts

libavjs-webcodecs-bridge.js: src/*.ts node_modules/.bin/browserify
	./src/build.js > $@

libavjs-webcodecs-bridge.min.js: libavjs-webcodecs-bridge.js node_modules/.bin/browserify
	./node_modules/.bin/minify --js < $< > $@

types/bridge.d.ts:
	mkdir -p types
	./node_modules/.bin/tsc \
		--declaration --emitDeclarationOnly \
		--outDir types

better-samples:
	for i in samples/*/; do \
		mkdir -p web/$$i; \
		cp -a $$i/* web/$$i/; \
		sed 's/<!-- LOAD LIBAV\.JS HERE -->/<script type="text\/javascript">LibAV = {base: "..\/libav"};<\/script><script type="text\/javascript" src="\/libav\/libav-3.6.4.4.1-webm-opus-flac.js"><\/script>/' -i web/$$i/index.html; \
	done
	cp samples/*.* web/samples/

node_modules/.bin/browserify:
	npm install

clean:
	rm -f libavjs-webcodecs-bridge.js libavjs-webcodecs-bridge.min.js
	rm -rf types

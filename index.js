'use strict';

const path = require('path');
const loaderUtils = require('loader-utils');
const validateOptions = require('schema-utils');
const WebWorkerTemplatePlugin = require('webpack/lib/webworker/WebWorkerTemplatePlugin');
const NodeTargetPlugin = require('webpack/lib/node/NodeTargetPlugin');
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');
const schema = require('./options.json');

const getFetch = (file, content, options) => {
    const publicPath = `__webpack_public_path__ + ${JSON.stringify(file)}`;
    return `fetch(${publicPath})`;
};

module.exports = function fetchWasm() {};

module.exports.pitch = function pitch(request) {
    if (!this.webpack) throw new Error('Only usable with webpack');
    this.cacheable(false);
    const callback = this.async();
    const options = loaderUtils.getOptions(this) || {};

    validateOptions(schema, options, 'Fetch WASM');

    const filename = loaderUtils.interpolateName(this, options.name || '[hash].wasm', {
        context: options.context || this.options.context,
        regExp: options.regExp,
    });

    const outputOptions = {
        filename,
        chunkFilename: `[id].${filename}`,
        namedChunkFilename: null
    };

    /*
    if (this.options && this.options.worker && this.options.worker.output) {
        Object.keys(this.options.worker.output).forEach((name) => {
        outputOptions[name] = this.options.worker.output[name];
        });
    }
    */

    const compiler = this._compilation.createChildCompiler('fetch', outputOptions);
    compiler.apply(new WebWorkerTemplatePlugin(outputOptions));
    // if (this.target !== 'webworker' && this.target !== 'web') {
    //     compiler.apply(new NodeTargetPlugin());
    // }

    compiler.apply(new SingleEntryPlugin(this.context, `!!${request}`, 'main'));
    // if (this.options && this.options.worker && this.options.worker.plugins) {
    //     this.options.worker.plugins.forEach(plugin => compiler.apply(plugin));
    // }

    const subCache = `subcache ${__dirname} ${request}`;
    compiler.plugin('compilation', (compilation) => {
        if (compilation.cache) {
            if (!compilation.cache[subCache]) {
                compilation.cache[subCache] = {};
            }
            compilation.cache = compilation.cache[subCache];
        }
    });

    compiler.runAsChild((err, entries, compilation) => {
        if (err) return callback(err);
        if (entries[0]) {
            const wasmFile = entries[0].files[0];
            const fetchFactory = getFetch(wasmFile, compilation.assets[wasmFile].source(), options);
            return callback(null, `module.exports = function() {\n\treturn ${fetchFactory};\n};`);
        }
        return callback(null, null);
    });
}
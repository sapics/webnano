#!/usr/bin/env node
'use strict';
const fs = require('fs-extra')
const path = require('path')

const htmlMinify = require('html-minifier').minify

const postcss = require('postcss')
const cssNano = postcss([require('cssnano')])

const UglifyJS = require('uglify-js')

const imagemin = require('imagemin')
const imageminGifsicle = require('imagemin-gifsicle')
const imageminMozjpeg = require('imagemin-mozjpeg')
const imageminJpegtran = require('imagemin-jpegtran')
const imageminPngquant = require('imagemin-pngquant')
const imageminZopfli = require('imagemin-zopfli')
const imageminSvgo = require('imagemin-svgo')

const ProgressBar = require('progress')

const _getFolderSize = require('get-folder-size')
function getFolderSize(path){
	return new Promise(function(resolve, reject){
		_getFolderSize(path, function(err, r){
			if(err) return reject(err);
			resolve(r)
		})
	})
}

module.exports = function(opts){
	// option settings
	if(typeof opts !== 'object'){
		opts = {path: opts}
	}

	var sepEndReg = /(?:\\|\/)+$/
	var setStartReg = /^(?:\\|\/)+/
	var inputPath = opts.path.replace(sepEndReg, '')
	var withConsoleLog = opts.console || false
	var minifiedPath = (opts.output || inputPath + '-minified').replace(sepEndReg, '')

	withConsoleLog && console.log('SRC PATH: ' + inputPath)
	withConsoleLog && console.log('MINIFIED PATH: ' + minifiedPath)

	var minifyTextExts = ['js', 'css', 'html', 'htm']
	var minifyImageExts = ['gif', 'png', 'jpeg', 'jpg', 'svg']
	var minifyExtReg = new RegExp('\\.(' + minifyTextExts.join('|') + '|' + minifyImageExts.join('|') + ')$', 'i')
	var promises = []

	// minify text file
	function minifyText(text, src, dest, ext){
		switch(ext){
		case 'css':
			return cssNano.process(text, {from: undefined}).then(function(result){
				return result.css
			}).catch(function(e){
				if(e.message){
					e.message = src + '\n' + e.message;
				}
				throw e
			})
		case 'js':
			return new Promise(function(resolve, reject){
				var result = UglifyJS.minify(text)
				if(result.error) return reject(src + '\n' + result.error)
				resolve(result.code)
			})
		case 'html':
		case 'htm':
			try{
				var r = htmlMinify(text, {collapseWhitespace: true, conservativeCollapse: true, minifyCSS: true, minifyJS: true})
				return Promise.resolve(r)
			}catch(e){
				return Promise.reject('HTML MINIFY ERROR: ' + src)
			}
		}
	}

	var useList = opts.lossless ? 
	[
		// Lossless Compression
		imageminGifsicle({optimizationLevel: 2}),
		imageminJpegtran(),
		imageminZopfli({more: true}),
		imageminSvgo({plugins:[{removeViewBox: false}]})
	]:[
		// Lossy Compression
		imageminGifsicle({optimizationLevel: 2}),
		imageminMozjpeg({quality:85}),
		imageminPngquant({speed:2, quality: '80-100'}),
		imageminZopfli({more: true}),
		imageminSvgo({plugins:[{removeViewBox: false}]})
	];

	function minify(src, dest, ext){
		if(minifyImageExts.indexOf(ext) !== -1){
			return imagemin([src], path.dirname(dest), {use: useList, watch: true})
		}
		return new Promise(function(resolve, reject){
			fs.readFile(src, 'utf8', function(err, text){
				if(err) return reject(err);
				minifyText(text, src, dest, ext).then(function(result){
					fs.writeFile(dest, result, function(err){
						if(err) return reject(err);
						resolve()
					});
				}).catch(reject)
			})
		})
	}

	var minifyFileCount = 0, minifiedFileCount = 0
	var progressOpts = {total: 1, width: 15, incomplete: ' '}
	if (!withConsoleLog) {
		progressOpts.stream = {write: function(){}, end: function(){}}
	}
	var bar = new ProgressBar(' [:bar] :percent [:num / :total] :last', progressOpts)
	var ps = fs.copy(inputPath, minifiedPath, {filter: function(src){
		var ext = minifyExtReg.exec(src)
		if(ext){
			ext = ext[1].toLowerCase()
			var newPath = src.replace(inputPath, minifiedPath)
			bar.total = ++minifyFileCount
			promises.push(minify(src, newPath, ext).then(function(){
				++minifiedFileCount
				bar.total = minifyFileCount
				bar.tick({num: minifiedFileCount, last: src.replace(inputPath, '').replace(setStartReg, '')})
			}).catch(function(){
				--minifyFileCount
				bar.total = minifyFileCount
				bar.tick({num: minifiedFileCount, last: src.replace(inputPath, '').replace(setStartReg, '')})
				return fs.copy(src, newPath)
			}))
			return false
		}
		return true
	}}).then(function(r){
		return Promise.all(promises).then(function(){
			if(withConsoleLog){
				var p1 = getFolderSize(inputPath), p2 = getFolderSize(minifiedPath)
				Promise.all([p1, p2]).then(function(results){
					var dif = results[0] - results[1]
					console.log(results[0].toLocaleString() + ' bytes >>>> ' + results[1].toLocaleString() + ' bytes')
					console.log(dif.toLocaleString() + ' bytes (%s %) SAVED!', (dif/results[0] * 100).toFixed(2))
				})
			}
		})
	})

	if(withConsoleLog){
		return ps.catch(function(error){
			console.error(error)
		})
	}
	return ps
}

const fs = require('fs');
const sanitize = require("sanitize-filename");
const transliteration = require("transliteration");
const errors = require('../../../errors');
const utils = require('../../../utils');
const mtUtils = require("metastocle/src/server/transports/express/midds");
const stUtils = require("storacle/src/server/transports/express/midds");
const midds = Object.assign({}, mtUtils, stUtils);

/**
 * Song addition control
 */
midds.songAdditionControl = node => {
  return async (req, res, next) => {
    try {
      if(req.clientAddress != node.address && await node.isAddressTrusted(req.clientAddress)) {
        return next();
      }
      
      if(!req.query.controlled) {
        return next();
      }

      return midds.approval(node)(req, res, next);
    }
    catch(err) {
      next(err);
    }
  }
};

/**
 * Song removal control
 */
midds.songRemovalControl = node => {
  return async (req, res, next) => {
    try {
      const title = req.body.title;
      node.songTitleTest(title); 
      req.document = await node.db.getMusicByPk(title);
      
      if(!req.document || req.document.priority < 1) {
        return next();
      }
     
      return midds.approval(node)(req, res, next);
    }
    catch(err) {
      next(err);
    }
  }
};

/**
 * Control file access
 */
midds.fileAccess = node => {
  return async (req, res, next) => {
    try {
      let doc;
      
      if(req.query.f) {
        const fileHash = String(req.query.f);
        doc = await node.db.getMusicByFileHash(fileHash);
      }

      if(!doc) {
        const titleHash = String(req.params.hash).split('.')[0];
        const title = utils.decodeSongTitle(titleHash);
        doc = await node.db.getMusicByPk(title);
      }
      
      doc && await node.db.accessDocument(doc);
      req.document = doc;
      next();
    }
    catch(err) {
      next(err);
    }
  }
};

/**
 * Provide audio receiving
 */
midds.audio = node => {
  return async (req, res, next) => {
    try {  
      const err404 = new errors.NotFoundError('File not found');   

      if(!req.document) {
        throw err404;
      }  
      
      const hash = req.document.fileHash;

      if(!await node.hasFile(hash)) {
        throw err404;
      }
      
      if(req.headers['storacle-cache-check']) {
        return hash == req.query.f? res.send(''): next(err404);
      }

      const cache = Math.ceil(node.options.file.responseCacheLifetime / 1000);
      const filePath = node.getFilePath(hash);
      const info = await utils.getFileInfo(filePath, { hash: false });  
      const filename = sanitize(transliteration.transliterate(req.document.title));
      const range = String(req.headers.range);
      cache && res.set('Cache-Control', `public, max-age=${cache}`);
      info.mime && res.setHeader('Content-Type', info.mime);
      res.setHeader('Content-Disposition', `inline; filename="${ filename }.${ info.ext || 'mp3' }"`);       

      if (range.match('bytes=')) {
        const maxEnd = info.size - 1;
        const parts = range.replace(/bytes=/, '').split('-');
        let start = parseInt(parts[0], 10) || 0;        
        let end = parts[1]? parseInt(parts[1], 10): maxEnd;
        start > maxEnd && (start = maxEnd);
        end > maxEnd && (end = maxEnd);
        const chunkSize = (end - start) + 1;
        const stream = fs.createReadStream(filePath, { start, end });
        res.setHeader("Content-Range", `bytes ${ start }-${ end }/${ info.size }`);
        res.setHeader("Accept-Ranges", 'bytes');
        res.setHeader("Content-Length", chunkSize);
        res.status(206);
        stream.on('error', next).pipe(res);
        return;
      } 
      
      res.setHeader("Content-Length", info.size);
      const stream = fs.createReadStream(filePath);
      stream.on('error', next).pipe(res);
    }
    catch(err) {
      next(err);
    }
  }
};

/**
 * Provide covers receiving
 */
midds.cover = node => {
  return async (req, res, next) => {
    try {  
      const err404 = new errors.NotFoundError('File not found');

      if(!req.document) {
        throw err404;
      }
      
      const hash = req.document.fileHash;
      const filePath = node.getFilePath(hash);        
      const tags = await utils.getSongTags(filePath);
      
      if(!tags.APIC) {
        throw err404;
      }

      if(req.headers['storacle-cache-check']) {
        return hash == req.query.f? res.send(''): next(err404);
      }
      
      const cache = Math.ceil(node.options.file.responseCacheLifetime / 1000);        
      const info = await utils.getFileInfo(tags.APIC, { hash: false });
      const filename = sanitize(transliteration.transliterate(req.document.title));  
      info.mime && res.setHeader("Content-Type", info.mime);      
      res.setHeader('Content-Disposition', `inline; filename="${ filename }.${ info.ext || 'jpg' }"`); 
      cache && res.set('Cache-Control', `public, max-age=${cache}`);
      res.setHeader("Content-Length", info.size);
      res.end(tags.APIC, 'binary');
    }
    catch(err) {
      next(err);
    }
  }
};

/**
 * Control song requests limit by a title and hash
 */
midds.requestQueueSong = (node) => {
  return async (req, res, next) => {
    const options = { limit: 1, fnHash: key => key };
    const title = String(req.query.title? req.query.title: req.body.title);
    const arr = [title];
    
    for(let key in node.__requestQueue) {
      if(utils.getSongSimilarity(key, title) >= node.options.music.similarity) {
        arr.push(key);
      }
    }

    return midds.requestQueue(node, arr, options)(req, res, next);
  }
};

module.exports = midds;
const midds = require('./midds');
const controllers = require('./controllers');

module.exports = [
  { name: 'favicon', fn: controllers.favicon },
  { name: 'static', url: '/', fn: controllers.static },
  { 
    name: 'audio', 
    method: 'get', 
    url: '/audio/:hash', 
    fn: [
      midds.networkAccess,
      midds.fileAccess,
      midds.audio
    ]
  },
  { 
    name: 'cover', 
    method: 'get', 
    url: '/cover/:hash', 
    fn: [
      midds.networkAccess,
      midds.fileAccess,
      midds.cover
    ]
  },
  { name: 'indexPage', method: 'get', url: '*', fn: [midds.networkAccess, controllers.indexPage] }
];
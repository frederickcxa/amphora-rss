'use strict';

const h = require('highland'),
  xml = require('xml');
var log = require('./services/log').setup({ file: __filename });

/**
 * Elevate category tags into the
 * the top of the document
 *
 * @param  {Array} group
 * @return {Array}
 */
function elevateCategory(group) {
  return group
    .map(function ({ item }) {
      return item
        .map(entry => entry && entry.category)
        .filter(entry => !!entry)
        .join(',');
    })
    .map(string => ({ category: string }));
}

/**
 * Add the meta tags around the feed
 *
 * @param  {String} title
 * @param  {String} description
 * @param  {String} link
 * @param  {String|Number} [copyright]
 * @param  {String} [generator]
 * @param  {String} [docs]
 * @return {Array}
 */
function feedMetaTags({ title, description, link, copyright, generator, docs }) {
  return function (group) {
    var now, siteMeta;

    if (!title || !description || !link) {
      throw new Error('A `title`, `description` and `link` property are all required in the `meta` object for the RSS renderer');
    }

    now = new Date();
    siteMeta = [
      { title },
      { description },
      { link },
      { lastBuildDate: now.toString() },
      { docs: docs || 'http://blogs.law.harvard.edu/tech/rss' },
      { copyright: copyright || now.getFullYear() },
      { generator: generator || 'Feed delivered by Clay' }
    ];

    return siteMeta.concat(elevateCategory(group), group);
  };
}

/**
 * Wraps content in top level RSS and Channel tags
 *
 * @param  {Array} data
 * @return {Object}
 */
function wrapInTopLevel(data) {
  return {
    rss: [{
      _attr: {
        version: '2.0',
        'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
        'xmlns:media': 'http://search.yahoo.com/mrss/',
        'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        'xmlns:mi': 'http://schemas.ingestion.microsoft.com/common/'
      }
    }, {
      channel: data
    }]
  };
}

/**
 * Wrap each entry in an object under the `item` property
 *
 * @param  {Object} entry
 * @return {Object}
 */
function wrapInItem(entry) {
  return { item: entry };
}

function sendError(res, e, message) {
  var message = message || e.message;

  res.status(500);
  res.json({ status: 500, message });

  log('error', e.message, {
    stack: e.stack
  });
}

/**
 * Given the data object from Amphora, make the XML
 *
 * @param  {Object} data
 * @param  {Object} info
 * @param  {Object} res
 * @return {Promise}
 */
function render({ feed, meta }, info, res) {
  return h(feed)
    .map(wrapInItem)
    .collect()
    .map(feedMetaTags(meta))
    .map(wrapInTopLevel)
    .errors(e => sendError(res, e))
    .toPromise(Promise)
    .then(data => {
      if (!data) {
        throw new Error('No data send to XML renderer, cannot respond');
      }

      res.type('text/rss+xml');
      res.send(xml(data, { declaration: true, indent: '\t' }));
    })
    .catch(e => sendError(res, e));
};

module.exports.render = render;

// Exported for testing
module.exports.wrapInItem = wrapInItem;
module.exports.wrapInTopLevel = wrapInTopLevel;
module.exports.feedMetaTags = feedMetaTags;
module.exports.elevateCategory = elevateCategory;
module.exports.setLog = (fake) => log = fake;

const util = require('util')
const db = require('../lib/db');
const validation = require('../lib/validation');
const async = require('async');

const makeValidator = validation.makeValidator;
const optional = validation.optional;
const required = validation.required;

const Criteria = require('./criteria')
const Category = require('./category')
const Tags = require('./tag')

const Badges = db.table('badges', {
  fields: [
    'id',
    'slug',
    'name',
    'strapline',
    'earnerDescription',
    'consumerDescription',
    'issuerUrl',
    'rubricUrl',
    'criteriaUrl',
    'timeValue',
    'timeUnits',
    'limit',
    'unique',
    'created',
    'archived',
    'imageId',
    'systemId',
    'issuerId',
    'programId',
    'type'
  ],
  relationships: {
    image: {
      type: 'hasOne',
      local: 'imageId',
      foreign: { table: 'images', key: 'id' },
      optional: true
    },
    system: {
      type: 'hasOne',
      local: 'systemId',
      foreign: { table: 'systems', key: 'id' },
      optional: true,
    },
    issuer: {
      type: 'hasOne',
      local: 'issuerId',
      foreign: { table: 'issuers', key: 'id' },
      optional: true,
    },
    program: {
      type: 'hasOne',
      local: 'programId',
      foreign: { table: 'programs', key: 'id' },
      optional: true,
    },
    criteria: {
      type: 'hasMany',
      local: 'id',
      foreign: { table: 'criteria', key: 'badgeId' }
    },
    categories: {
      type: 'hasMany',
      local: 'id',
      foreign: { table: 'categories', key: 'badgeId' },
    },
    tags: {
      type: 'hasMany',
      local: 'id',
      foreign: { table: 'tags', key: 'badgeId' }
    }
  },
  methods: {
    setCriteria: setCriteria,
    setCategories: setCategories,
    setTags: setTags,
    del: del,
    toResponse: function () {
      return Badges.toResponse(this)
    },
  }
});

Badges.toResponse = function toResponse(row, request) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    strapline: row.strapline,
    earnerDescription: row.earnerDescription,
    consumerDescription: row.consumerDescription,
    issuerUrl: row.issuerUrl,
    rubricUrl: row.rubricUrl,
    timeValue: row.timeValue,
    timeUnits: row.timeUnits,
    limit: row.limit,
    unique: row.unique,
    created: row.created,
    imageUrl: row.image ? row.image.toUrl(request) : undefined,
    type: row.type,
    archived: !!row.archived,
    system: maybeObject(row.system),
    issuer: maybeObject(row.issuer),
    program: maybeObject(row.program),
    criteriaUrl: row.criteriaUrl,
    criteria: (row.criteria || []).map(function(criterion) {
      return Criteria.toResponse(criterion);
    }),
    type: row.type,
    categories: (row.categories || []).map(function(category) {
      return Category.toResponse(category);
    }),
    tags: (row.tags || []).map(function(tag) {
      return Tags.toResponse(tag);
    }),
  };
}
function maybeObject(obj) {
  return (obj && obj.id) ? obj.toResponse() : undefined
}

Badges.validateRow = makeValidator({
  id: optional('isInt'),
  slug: required('len', 1, 255),
  name: required('len', 1, 255),
  strapline: optional('len', 0, 140),
  earnerDescription: required('len', 1),
  consumerDescription: required('len', 1),
  timeValue: optional('isInt'),
  timeUnits: optional('isIn', ['minutes','hours','days','weeks']),
  limit: optional('isInt'),
  unique: required('isIn', ['0','1','true','false']),
  criteriaUrl: required('isUrl'),
  imageId: optional('isInt'),
  programId: optional('isInt'),
  issuerId: optional('isInt'),
  systemId: optional('isInt'),
});

function setCriteria(criteria, callback) {
  var criteriaIds = [];
  const badgeId = this.id;
  async.each(criteria, function(criterion, done) {
    criterion.badgeId = badgeId;
    Criteria.put(criterion, function(err, result) {
      if (err)
        return done(err);

      const rowId = result.insertId || result.row.id;
      criteriaIds.push(rowId);

      return done();
    });
  },
  function done(err) {
    if (err)
      return callback(err);

    // Now that we have added all the new criteria, we want to delete any old criteria attached to this badge
    const deleteQuery = {
      badgeId: {
        value: badgeId,
        op: '='
      }
    };

    if (criteriaIds.length) {
      deleteQuery.id = criteriaIds.map(function(criterionId) {
        return {
          op: '!=',
          value: criterionId
        };
      });
    }

    Criteria.del(deleteQuery, function(err) {
      if (err)
        return callback(err);

      Badges.getOne({ id: badgeId }, { relationships: true }, callback);
    });
  });
}

function setCategories(categories, callback) {
  const badgeId = this.id;
  if (!Array.isArray(categories))
    categories = [categories];

  Category.del({badgeId: badgeId}, function (err) {
    if (err)
      return callback(err);

    const stream = Category.createWriteStream();

    stream.on('error', function (err) {
      callback(err);
      callback = function () {};
    });

    stream.on('close', function () {
      callback(null);
    });

    categories.forEach(function (category, pos) {
      // Filter out empty and duplicate values
      if (!category || categories.indexOf(category) !== pos)
        return;

      stream.write({badgeId: badgeId, value: category});
    });

    stream.end();
  });
}

function setTags(tags, callback) {
  const badgeId = this.id;
  if (!Array.isArray(tags))
    tags = [tags];

  tags = tags.map(function (tag) { return tag.value || tag });
  
  Tags.del({badgeId: badgeId}, function (err) {
    if (err)
      return callback(err);

    const stream = Tags.createWriteStream();

    stream.on('error', function (err) {
      callback(err);
      callback = function () {};
    });

    stream.on('close', function () {
      callback(null);
    });

    tags.forEach(function (tag, pos) {
      // Filter out empty and duplicate values
      if (!tag || tags.indexOf(tag) !== pos)
        return;

      stream.write({badgeId: badgeId, value: tag});
    });

    stream.end();
  });
}

function del(callback) {
  const badgeId = this.id;
  Criteria.del({ badgeId: badgeId }, function(err) {
    if (err)
      callback(err);

    Badges.del({ id: badgeId }, callback);
  });
};

exports = module.exports = Badges;

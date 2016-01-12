'use strict';

var Selection = require('./selection');
var Paragraph = require('./paragraph');
var Section = require('./section');
var Utils = require('./utils');
var Loader = require('./loader');
var Layout = require('./layout');
var Figure = require('./figure');
var EmbeddedComponent = require('./extensions/embeddedComponent');


/**
 * Article main.
 * @param {Object} optParams Optional params to initialize the Article object.
 * Default:
 *   {
 *     sections: []
 *   }
 */
var Article = function(optParams) {
  // Override default params with passed ones if any.
  var params = Utils.extend({
    // The sections that is in this article.
    sections: [],
    editor: null
  }, optParams);

  /**
   * Editor that contains this article.
   * @type {Editor}
   */
  this.editor = params.editor;

  /**
   * Selection object.
   * @type {Selection}
   */
  this.selection = Selection.getInstance();

  /**
   * DOM element tied to this object.
   * @type {HTMLElement}
   */
  this.dom = document.createElement(Article.TAG_NAME);
  this.dom.className = Article.ELEMENT_CLASS_NAME;

  /**
   * The article sections.
   * @type {Array.<Section>}
   */
  this.sections = [];
  for (var i = 0; i < params.sections.length; i++) {
    this.insertSection(params.sections[i]);
  }

  /**
   * Operations history on the article.
   * @type {Array.<Object>}
   */
  this.history = [];

  /**
   * Currently at history point.
   * @type {number}
   */
  this.historyAt = 0;

  /**
   * Whether the article is already rendered.
   * @type {boolean}
   */
  this.isRendered = false;

  /**
   * Whether the article is rendered in edit mode or not.
   * @type {boolean}
   */
  this.editMode = false;

};
module.exports = Article;


/**
 * Element Tag name when creating the associated DOM element.
 * @type {string}
 */
Article.TAG_NAME = 'article';


/**
 * Element class name.
 * @type {string}
 */
Article.ELEMENT_CLASS_NAME = 'carbon';


/**
 * Create and initiate an Article object from JSON.
 * @param  {Object} json JSON representation of the article.
 * @return {Article} Article object representing the JSON data.
 */
Article.fromJSON = function (json) {
  var sections = [];
  for (var i = 0; i < json.sections.length; i++) {
    sections.push(Section.fromJSON(json.sections[i]));
  }

  return new Article({
    sections: sections
  });
};


/**
 * Inserts a new section in article.
 * @param  {Section} section Section object.
 * @return {Section} The inserted section.
 */
Article.prototype.insertSection = function(section) {
  // Section should always have a component when inserted into article.
  if (!section.components || !section.components.length) {
    section.insertComponentAt(new Paragraph(), 0);
  }

  this.sections.push(section);
  if (this.isRendered) {
    section.render(this.dom, {editMode: this.editMode});
  }
  return section;
};


/**
 * Removes a section from article.
 * @param  {Section} section Section to remove.
 * @return {Section} Removed section.
 */
Article.prototype.removeSection = function(section) {
  var index = this.sections.indexOf(section);
  this.sections.splice(index, 1);
  return section;
};


// TODO: Implement.
Article.prototype.updateSection = function(section) {
  return section;
};


/**
 * Inserts a new component in article.
 * @param  {Component} component Component object.
 * @return {Component} The inserted component.
 */
Article.prototype.insertComponent = function(component) {
  var section = this.selection.getSectionAtEnd().
      insertComponent(component);
  return section;
};


/**
 * Removes a component from article.
 * @param  {Component} component Component to remove.
 * @return {Component} Removed component.
 */
Article.prototype.removeComponent = function(component) {
  var index = this.sections.indexOf(component);
  this.components.splice(index, 1);
  return component;
};


/**
 * Returns first component in the section.
 * @return {Component} Returns first component.
 */
Article.prototype.getFirstComponent = function() {
  return this.sections[0].getFirstComponent();
};


/**
 * Returns last component in the section.
 * @return {Component} Returns last component.
 */
Article.prototype.getLastComponent = function() {
  return this.sections[this.sections.length - 1].getLastComponent();
};


/**
 * Returns true if the first component in the article is an image inside
 * a bleed or staged layouts.
 * @return {boolean}
 */
Article.prototype.hasCover = function() {
  var coverLayouts = [Layout.Types.Staged, Layout.Types.Bleed];
  var layout = this.getFirstComponent();
  while (!layout.getLength() && layout.getNextComponent()) {
    layout = layout.getNextComponent();
  }
  if (layout instanceof Layout) {
    var firstComponent = layout.getFirstComponent();
    return ((firstComponent instanceof Figure ||
             firstComponent instanceof EmbeddedComponent) &&
            coverLayouts.indexOf(layout.type) !== -1);
  }
};


/**
 * Renders the article inside the element.
 */
Article.prototype.render = function(element, options) {
  this.editMode = !!(options && options.editMode);
  element.appendChild(this.dom);

  // TODO(mkhatib): This is only enabled in non-edit mode because otherwise
  // the tool will add an object to the root of the article and the cursor
  // would be moving to that object. We need to find a better way to do
  // resize listener instead of this.
  if (!this.editMode) {
    Utils.addResizeListener(this.dom, this.handleResize_.bind(this));
  }

  this.isRendered = true;
  for (var i = 0; i < this.sections.length; i++) {
    this.sections[i].render(this.dom, {editMode: this.editMode});
  }
};


/**
 * Creates and return a JSON representation of the model.
 * @return {Object} JSON representation of this section.
 */
Article.prototype.getJSONModel = function() {
  var article = {
    sections: []
  };

  for (var i = 0; i < this.sections.length; i++) {
    article.sections.push(this.sections[i].getJSONModel());
  }

  return article;
};


/**
 * Returns the length of the article.
 * @return {number} Length of article.
 */
Article.prototype.getLength = function() {
  var length = 0;
  for (var i = 0; i < this.sections.length; i++) {
    length += this.sections[i].getLength();
  }
  return length;
};



/**
 * Returns the first header paragraph in the article.
 * @return {string} First header of the article.
 */
Article.prototype.getTitle = function() {
  return this.sections[0].getTitle();
};


/**
 * Returns the first non-header paragraph in the article.
 * @return {string} First non-header paragraph of the article.
 */
Article.prototype.getSnippet = function() {
  return this.sections[0].getSnippet();
};


/**
 * Apply list of operations to the article model.
 * @param  {Array.<Object>} ops List of operations to apply.
 */
Article.prototype.transaction = function(ops) {
  if (this.historyAt < this.history.length) {
    this.history.splice(
        this.historyAt, this.history.length - this.historyAt);
  }
  this.history.push(ops);
  this.do();
};


/**
 * Executes the next available operation in the article history.
 */
Article.prototype.do = function() {
  var ops = this.history[this.historyAt++];

  for (var i = 0; i < ops.length; i++) {
    this.exec(ops[i], 'do');
  }
};


/**
 * Executes an operation in the history only if there were any.
 */
Article.prototype.redo = function() {
  if (this.historyAt < this.history.length) {
    this.do();
  }
};


/**
 * Executes the reverse (undo) part of an operation.
 */
Article.prototype.undo = function() {
  if (this.historyAt > 0) {
    var ops = this.history[--this.historyAt];

    for (var i = ops.length - 1; i >= 0; i--) {
      this.exec(ops[i], 'undo');
    }
  }
};


/**
 * Executes an operation with the passed action.
 * @param  {Object} operation An operation object to execute.
 * @param  {string} action Can be 'do' or 'undo'.
 */
Article.prototype.exec = function(operation, action) {
  var selection = this.selection;
  var op = operation[action].op;
  var component, componentName, value, index, count;

  if (op === 'insertChars') {
    componentName = operation[action].component;
    value = operation[action].value;
    index = operation[action].index;
    component = Utils.getReference(componentName);
    component.insertCharactersAt(value, index);

    if (operation[action].cursorOffset) {
      selection.setCursor({
        component: component,
        offset: operation[action].cursorOffset
      });
    }
  } else if (op === 'removeChars') {
    componentName = operation[action].component;
    index = operation[action].index;
    count = operation[action].count;
    component = Utils.getReference(componentName);
    component.removeCharactersAt(index, count);

    if (operation[action].cursorOffset) {
      selection.setCursor({
        component: component,
        offset: operation[action].cursorOffset
      });
    }
  } else if (op === 'updateComponent') {
    componentName = operation[action].component;
    value = operation[action].value;
    component = Utils.getReference(componentName);

    if (value !== undefined) {
      component.setText(value);
    }

    // If this is to update inline formatting.
    if (operation[action].formats) {
      component.applyFormats(operation[action].formats);
    }

    // If this is to update the component attributes.
    if (operation[action].attrs) {
      component.updateAttributes(operation[action].attrs);
    }

    if (operation[action].cursorOffset !== undefined) {
      if (!operation[action].selectRange) {
        selection.setCursor({
          component: component,
          offset: operation[action].cursorOffset
        });
      } else {
        selection.select({
          component: component,
          offset: operation[action].cursorOffset
        }, {
          component: component,
          offset: operation[action].cursorOffset + operation[action].selectRange
        });
      }
    }
  } else if (op === 'deleteComponent') {
    var selectComponent, selectOffset;
    component = Utils.getReference(operation[action].component);
    var componentIndex = component.getIndexInSection();
    if (componentIndex === 0) {
      selectComponent = component.getNextComponent();
      selectOffset = 0;
    } else if (componentIndex === component.section.getLength() - 1) {
      selectComponent = component.getPreviousComponent();
      selectOffset = component.getLength();
    }
    component.section.removeComponent(component);

    if (selectComponent) {
      selection.setCursor({
        component: selectComponent,
        offset: selectOffset
      });
    }
  } else if (op === 'insertComponent') {
    // TODO(mkhatib): Insert components inside a component.
    var section = Utils.getReference(operation[action].section);
    var options = Utils.extend({
      name: operation[action].component,
    }, operation[action].attrs || {});

    var constructorName = operation[action].componentClass;
    var ComponentClass = Loader.load(constructorName);
    component = new ComponentClass(options);
    section.insertComponentAt(component, operation[action].index);
  }
};


/**
 * Handles the article container size changing.
 */
Article.prototype.handleResize_ = function() {
  for (var i = 0; i < this.sections.length; i++) {
    this.sections[i].rerender();
  }
};

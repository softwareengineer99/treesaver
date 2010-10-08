/**
 * @fileoverview Responsible for managing the application state. Should really be called ChromeManager
 */

goog.provide('treesaver.ui.StateManager');

goog.require('treesaver.capabilities');
goog.require('treesaver.debug');
goog.require('treesaver.dom');
goog.require('treesaver.events');
goog.require('treesaver.resources');
goog.require('treesaver.ui.Chrome');

/**
 * Current state
 */
treesaver.ui.StateManager.state_;

/**
 * Storage for all the chromes
 *
 * @type {!Array.<treesaver.ui.Chrome>}
 */
treesaver.ui.StateManager.chromes_;

/**
 * Initialize the state manager
 *
 * @return {boolean}
 */
treesaver.ui.StateManager.load = function() {
  // Setup state
  treesaver.ui.StateManager.state_ = {
    orientation: 0,
    size: { w: 0, h: 0 }
  };

  // Clean the body
  treesaver.dom.clearChildren(/** @type {!Element} */ (document.body));

  // Install container for chrome used to measure screen space, etc
  treesaver.ui.StateManager.state_.chromeContainer = treesaver.ui.StateManager.getChromeContainer_();

  // Get or install the viewport
  treesaver.ui.StateManager.state_.viewport = treesaver.ui.StateManager.getViewport_();

  // Get the chromes
  treesaver.ui.StateManager.chromes_ = treesaver.ui.StateManager.getChromes_();

  // Can't do anything without mah chrome
  if (!treesaver.ui.StateManager.chromes_.length) {
    treesaver.debug.error('No chromes');

    return false;
  }

  // Find and install the first chrome by calling checkState manually (this will also set up the size)
  treesaver.ui.StateManager.checkState();

  // Setup checkstate timer
  treesaver.scheduler.repeat(treesaver.ui.StateManager.checkState, CHECK_STATE_INTERVAL, Infinity, [], 'checkState');

  if (treesaver.capabilities.SUPPORTS_ORIENTATION) {
    treesaver.events.addListener(window, 'orientationchange', treesaver.ui.StateManager.onOrientationChange);
  }

  // Hide the address bar on iPhone
  treesaver.scheduler.queue(window.scrollTo, [0, 1]);

  return true;
};

treesaver.ui.StateManager.unload = function() {
  // Remove handler
  if (treesaver.capabilities.SUPPORTS_ORIENTATION) {
    treesaver.events.removeListener(window, 'orientationchange', treesaver.ui.StateManager.onOrientationChange);
  }

  // Lose references
  treesaver.ui.StateManager.state_ = null;
  treesaver.ui.StateManager.chromes_ = null;
};

/**
 * @private
 * @return {!Element}
 */
treesaver.ui.StateManager.getChromeContainer_ = function() {
  var container = document.createElement('div');
  container.setAttribute('id', 'chromeContainer');
  document.body.appendChild(container);
  return container;
};

/**
 * @private
 * @return {!Element}
 */
treesaver.ui.StateManager.getViewport_ = function() {
  var viewport = treesaver.dom.getElementsByProperty('name', 'viewport', 'meta')[0];

  if (!viewport) {
    // Create a viewport if one doesn't exist
    viewport = document.createElement('meta');
    viewport.setAttribute('name', 'viewport');
    treesaver.dom.getElementsByTagName('head')[0].appendChild(viewport);
  }

  return viewport;
};

/**
 * @private
 * @return {!Array.<treesaver.ui.Chrome>}
 */
treesaver.ui.StateManager.getChromes_ = function() {
  var chromes = [];

  treesaver.resources.findByClassName('chrome').forEach(function (node) {
    var chrome,
        requires = node.getAttribute('data-requires');

    if (requires && !treesaver.capabilities.check(requires.split(' '))) {
      // Doesn't meet our requirements, skip
      return;
    }

    treesaver.ui.StateManager.state_.chromeContainer.appendChild(node);

    chrome = new treesaver.ui.Chrome(node);
    chromes.push(chrome);

    treesaver.ui.StateManager.state_.chromeContainer.removeChild(node);
  });

  return chromes;
};

/**
 * Detect any changes in orientation, and update the viewport accordingly
 */
treesaver.ui.StateManager.onOrientationChange = function() {
  if (treesaver.ui.StateManager.state_.orientation === window['orientation']) {
    // Nothing to do (false alarm?)
    return;
  }

  // TODO: Fire event?
  //
  // TODO: Refactor this manual update
  treesaver.capabilities.updateClasses();

  treesaver.ui.StateManager.state_.orientation = window['orientation'];

  if (treesaver.ui.StateManager.state_.orientation % 180) {
    // Rotated (landscape)
    treesaver.ui.StateManager.state_.viewport.setAttribute('content',
      'width=device-height, height=device-width');
  }
  else {
    // Normal
    treesaver.ui.StateManager.state_.viewport.setAttribute('content',
      'width=device-width, height=device-height');
  }

  // Hide the address bar on the iPhone
  window.scrollTo(0, 1);

  // TODO: Update classes for styling?

  // TODO: Access widths to force layout?
};

/**
 * Gets the size currently visible within the browser
 *
 * @private
 * @return {{ w: number, h: number }}
 */
treesaver.ui.StateManager.getAvailableSize_ = function() {
  if (window.pageYOffset || window.pageXOffset) {
    window.scrollTo(0, 1);
  }

  // IE9+ and all other browsers
  if (SUPPORT_IE || 'innerWidth' in window) {
    return {
      w: window.innerWidth,
      h: window.innerHeight
    };
  }
  else {
    // IE8-
    return {
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight
    };
  }
};

/**
 * Tick function
 */
treesaver.ui.StateManager.checkState = function() {
  var availSize = treesaver.ui.StateManager.getAvailableSize_(),
      newChrome;

  // Check if we're at a new size
  if (availSize.h !== treesaver.ui.StateManager.state_.size.h || availSize.w !== treesaver.ui.StateManager.state_.size.w) {
    treesaver.ui.StateManager.state_.size = availSize;

    // Check if chrome still fits
    if (!treesaver.ui.StateManager.state_.chrome || !treesaver.ui.StateManager.state_.chrome.fits(availSize)) {
      // Chrome doesn't fit, need to install a new one
      newChrome = treesaver.ui.Chrome.select(treesaver.ui.StateManager.chromes_, availSize);

      if (!newChrome) {
        // TODO: Fire chrome failed event
        // TODO: Show error page (no chrome)
        return;
      }

      // TODO: Fire chrome change event?
      // Remove existing chrome
      treesaver.dom.clearChildren(treesaver.ui.StateManager.state_.chromeContainer);
      // Deactivate previous
      if (treesaver.ui.StateManager.state_.chrome) {
        treesaver.ui.StateManager.state_.chrome.deactivate();
      }

      // Activate and store
      treesaver.ui.StateManager.state_.chromeContainer.appendChild(newChrome.activate());
      treesaver.ui.StateManager.state_.chrome = newChrome;
    }

    // Chrome handles page re-layout, if necessary
    treesaver.ui.StateManager.state_.chrome.setSize(availSize);
  }
};

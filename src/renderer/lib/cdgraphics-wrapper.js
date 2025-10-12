// Wrapper to load cdgraphics as a global variable
// Since cdgraphics uses ES modules, we need to load it dynamically

(async function () {
  try {
    // Import the ES module
    const module = await import('./cdgraphics.js');

    // Make it available globally
    window.CDGraphics = module.default;

    console.log('💿 CDGraphics library loaded');
  } catch (error) {
    console.error('💿 Failed to load CDGraphics:', error);
  }
})();

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

// Animation and timing settings for UI interactions
const TIMING = {
    ZOOM_ANIMATION: 200,        // Duration for zoom in/out animations (ms)
    LAYOUT_AUTO_STOP: 5000,     // Auto-stop layout after 5 seconds
    TOOLTIP_OFFSET: 5,          // Pixel offset from cursor for tooltips
    SEARCH_MIN_LENGTH: 2        // Minimum characters to trigger search
};

// Bitcoin capacity conversion thresholds (satoshis to BTC/mBTC/μBTC)
const CAPACITY_THRESHOLDS = {
    BTC: 100000000,    // 1 BTC = 100M satoshis
    MBTC: 100000,      // 1 mBTC = 100K satoshis  
    UBTC: 1000         // 1 μBTC = 1K satoshis
};

// Cluster color palette for network communities
const CLUSTER_COLORS = {
    0: '#FF6B6B',   // Red
    1: '#4ECDC4',   // Teal
    2: '#45B7D1',   // Blue
    3: '#FFA07A',   // Light Salmon
    4: '#98D8C8',   // Mint
    5: '#F7DC6F',   // Yellow
    6: '#BB8FCE',   // Purple
    7: '#85C1E2',   // Sky Blue
    8: '#F8B739',   // Orange
    9: '#52B788',   // Green
    10: '#E07A5F',  // Terra Cotta
    11: '#3D5A80',  // Navy
    12: '#81B29A',  // Sage
    13: '#F2CC8F',  // Sand
    14: '#D62828',  // Crimson
    DEFAULT: '#607D8B'  // Gray for unknown
};

// Bridge node highlighting
const BRIDGE_NODE_CONFIG = {
    IMPORTANT_BRIDGE: {
        borderColor: '#FF0000',
        borderWidth: 3
    },
    REGULAR_BRIDGE: {
        borderColor: '#FFA500',
        borderWidth: 2
    }
};

// Edge coloring - using pre-calculated colors from data
const EDGE_HIGHLIGHT = {
    IMPORTANT_BRIDGE: '#FF0000',  // Red for critical bridges
    REGULAR_BRIDGE: '#FFA500',    // Orange for regular bridges
    DEFAULT: '#D8D8D8'            // Light gray for normal edges
};

// =============================================================================
// GLOBAL STATE
// =============================================================================

// Global state for tracking selected node (used for gray-out effect on edges)
let selectedNode = null;

// Global reference to current renderer instance for proper cleanup
let currentRenderer = null;
let currentLayoutManager = null;

// Store event listeners for proper cleanup
let controlButtonListeners = {
    zoomIn: null,
    zoomOut: null,
    resetView: null,
    toggleLayout: null
};

// Store the current search handler to remove it when needed
let currentSearchHandler = null;

// Track if a dataset is currently being loaded to prevent concurrent loads
let isLoadingDataset = false;

// =============================================================================
// CLEANUP FUNCTION
// =============================================================================

/**
 * Destroys the current visualization and cleans up all resources
 * Call this before loading a new dataset to prevent memory leaks and conflicts
 */
async function destroyVisualization() {
    console.log('🧹 Destroying current visualization...');
    
    // Stop any running layout
    if (currentLayoutManager && currentLayoutManager.isRunning) {
        const toggleBtn = document.getElementById('toggle-layout');
        if (toggleBtn) {
            currentLayoutManager.stop(toggleBtn);
        }
    }
    
    // Clear layout manager reference
    currentLayoutManager = null;
    
    // Destroy the Sigma renderer
    if (currentRenderer) {
        try {
            currentRenderer.kill();
            console.log('✅ Renderer destroyed');
        } catch (e) {
            console.warn('⚠️ Error killing renderer:', e);
        }
        currentRenderer = null;
    }
    
    // Remove the canvas element if it exists
    const graphContainer = document.getElementById('graph-container');
    const canvases = graphContainer.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        canvas.remove();
        console.log('✅ Canvas removed');
    });
    
    // Reset global state
    selectedNode = null;
    
    // Clear search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // Reset sidebar
    const nodeInfo = document.getElementById('node-info');
    const edgeInfo = document.getElementById('edge-info');
    if (nodeInfo) {
        nodeInfo.innerHTML = `
            <div class="info-title">Node Information</div>
            <div class="info-content">Select a node to see details</div>
        `;
    }
    if (edgeInfo) {
        edgeInfo.innerHTML = `
            <div class="info-title">Channel Information</div>
            <div class="info-content">Select a channel to see details</div>
        `;
    }
    
    // Wait a moment for everything to clean up
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('✅ Cleanup complete');
}

// =============================================================================
// DATA PROCESSING UTILITIES
// =============================================================================

/**
 * Calculates comprehensive statistics including percentiles for capacity and channels
 * Works with the new enhanced data format (snake_case fields)
 * @param {Array} nodes - Array of Lightning Network nodes
 * @param {Array} edges - Array of Lightning Network channels
 * @returns {Object} Enhanced statistics object with min/max values, percentiles, and total capacity
 */
function calculateDataStats(nodes, edges) {
    /**
     * Helper function to calculate percentiles from a sorted array
     * @param {Array} sortedArray - Pre-sorted array of numbers
     * @returns {Object} Statistics object with min, max, percentiles, and average
     */
    function calculatePercentiles(sortedArray) {
        const len = sortedArray.length;
        if (len === 0) return { min: 0, q25: 0, median: 0, q75: 0, max: 0, avg: 0 };
        
        const min = sortedArray[0];
        const max = sortedArray[len - 1];
        
        // Calculate percentile indices
        const q25Index = Math.max(0, Math.floor((len - 1) * 0.25));
        const medianIndex = Math.max(0, Math.floor((len - 1) * 0.50));
        const q75Index = Math.max(0, Math.floor((len - 1) * 0.75));
        
        const q25 = sortedArray[q25Index];
        const median = sortedArray[medianIndex];
        const q75 = sortedArray[q75Index];
        
        // Calculate average
        const sum = sortedArray.reduce((total, val) => total + val, 0);
        const avg = sum / len;
        
        return { min, q25, median, q75, max, avg };
    }
    
    // 1. Channel size distribution (from edges)
    const channelSizes = edges
        .map(edge => edge.capacity || 0)
        .filter(capacity => capacity > 0)
        .sort((a, b) => a - b);
    
    const channelSizeStats = calculatePercentiles(channelSizes);
    
    // 2. Node channel count distribution
    const nodeChannels = nodes
        .map(node => node.total_channels || 0)
        .filter(channels => channels > 0)
        .sort((a, b) => a - b);
    
    const channelStats = calculatePercentiles(nodeChannels);
    
    // 3. Node capacity distribution
    const nodeCapacities = nodes
        .map(node => node.total_capacity || 0)
        .filter(capacity => capacity > 0)
        .sort((a, b) => a - b);
    
    const nodeCapacityStats = calculatePercentiles(nodeCapacities);
    
    // 4. Node betweenness distribution
    const nodeBetweenness = nodes
        .map(node => node.node_betweenness || 0)
        .filter(betweenness => betweenness > 0)
        .sort((a, b) => a - b);
    
    const betweennessStats = calculatePercentiles(nodeBetweenness);
    
    // Calculate total capacity from node totals 
    const totalCapacity = nodeCapacities.reduce((sum, capacity) => sum + capacity, 0) / 2;
    
    // Return enhanced statistics object
    return {
        nodes: { 
            min: channelStats.min || 1, 
            max: channelStats.max || 1 
        },
        edges: { 
            min: channelSizeStats.min || 1, 
            max: channelSizeStats.max || 1 
        },
        totalCapacity: totalCapacity,
        channelSize: {
            min: channelSizeStats.min,
            q25: channelSizeStats.q25,
            median: channelSizeStats.median,
            q75: channelSizeStats.q75,
            max: channelSizeStats.max,
            avg: channelSizeStats.avg,
            count: channelSizes.length
        },
        channels: {
            min: channelStats.min,
            q25: channelStats.q25,
            median: channelStats.median,
            q75: channelStats.q75,
            max: channelStats.max,
            avg: channelStats.avg,
            count: nodeChannels.length
        },
        nodeCapacity: {
            min: nodeCapacityStats.min,
            q25: nodeCapacityStats.q25,
            median: nodeCapacityStats.median,
            q75: nodeCapacityStats.q75,
            max: nodeCapacityStats.max,
            avg: nodeCapacityStats.avg,
            count: nodeCapacities.length
        },
        betweenness: {
            min: betweennessStats.min,
            q25: betweennessStats.q25,
            median: betweennessStats.median,
            q75: betweennessStats.q75,
            max: betweennessStats.max,
            avg: betweennessStats.avg,
            count: nodeBetweenness.length
        }
    };
}

/**
 * Creates reusable calculators for consistent node/edge sizing across the graph
 * Node size based on channel count (more intuitive for Lightning Network)
 * Edge width based on channel capacity
 * Uses logarithmic scaling to handle wide range of values
 * Optimized for large graphs (40k+ edges) following Sigma.js demo best practices
 * @param {Object} dataStats - Pre-calculated statistics from calculateDataStats
 * @returns {Object} Calculator functions for nodeSize and edgeWidth
 */
function createSizeCalculators(dataStats) {
    const { nodes: nodeStats, edges: edgeStats } = dataStats;
    
    // Sigma.js demo sizing for large graphs with 40k+ edges
    const NODE_SIZE_RANGE = { min: 2, max: 20 };      // Nodes: 2-10px (smaller for dense graphs)
    const EDGE_WIDTH_RANGE = { min: 0.1, max: 2 };    // Edges: 0.5-2px (thin for visual clarity)
    
    return {
        nodeSize: (totalChannels) => {
            // Use channel count for sizing - more intuitive for Lightning Network
            if (!totalChannels || !nodeStats.max) return NODE_SIZE_RANGE.min;
            const normalizedValue = (Math.log(Math.max(totalChannels, 1)) - Math.log(Math.max(nodeStats.min, 1))) /
                                  (Math.log(nodeStats.max) - Math.log(Math.max(nodeStats.min, 1)));
            return NODE_SIZE_RANGE.min + normalizedValue * (NODE_SIZE_RANGE.max - NODE_SIZE_RANGE.min);
        },
        
        edgeWidth: (capacity) => {
            // Use capacity-based sizing for channels
            if (!capacity || !edgeStats.max) return EDGE_WIDTH_RANGE.min;
            const normalizedValue = (Math.log(Math.max(capacity, 1)) - Math.log(Math.max(edgeStats.min, 1))) /
                                  (Math.log(edgeStats.max) - Math.log(Math.max(edgeStats.min, 1)));
            return EDGE_WIDTH_RANGE.min + normalizedValue * (EDGE_WIDTH_RANGE.max - EDGE_WIDTH_RANGE.min);
        }
    };
}

/**
 * Converts satoshi amounts to Lightning Network standard display format
 * Uses BTC for larger amounts (≥ 0.01 BTC) with sats conversion, and short form sats for smaller amounts
 * @param {number} capacity - Capacity in satoshis
 * @returns {string} Formatted capacity string with unit
 */
function formatCapacity(capacity) {
    if (!capacity) return '0 sats';
    
    // Lightning Network threshold: 0.01 BTC = 1,000,000 satoshis
    const LIGHTNING_BTC_THRESHOLD = 1000000;
    
    if (capacity >= LIGHTNING_BTC_THRESHOLD) {
        const btcValue = capacity / CAPACITY_THRESHOLDS.BTC;
        
        // Format sats in short form
        let satsShort;
        if (capacity >= 1000000000) {
            satsShort = `${(capacity / 1000000000).toFixed(1)}B sats`;
        } else if (capacity >= 1000000) {
            satsShort = `${(capacity / 1000000).toFixed(1)}M sats`;
        } else {
            satsShort = `${(capacity / 1000).toFixed(0)}K sats`;
        }
        
        // For amounts ≥ 1 BTC, show 2 decimal places
        if (capacity >= CAPACITY_THRESHOLDS.BTC) {
            return `${btcValue.toFixed(2)} BTC (${satsShort})`;
        }
        // For amounts 0.01 - 1 BTC, show 3 decimal places
        else {
            return `${btcValue.toFixed(3)} BTC (${satsShort})`;
        }
    } else {
        // For small amounts, show in short form satoshis only
        if (capacity >= 1000) {
            return `${(capacity / 1000).toFixed(0)}K sats`;
        } else {
            return `${capacity} sats`;
        }
    }
}

// =============================================================================
// EDGE COLORING SYSTEM
// =============================================================================

/**
 * Gets edge color based on enhanced data attributes
 * Uses pre-calculated colors from data when available
 * @param {Object} edge - Edge data object
 * @returns {string} Color hex code
 */
function getEdgeColor(edge) {
    // Highlight important bridge channels
    if (edge.is_important_bridge_channel) {
        return EDGE_HIGHLIGHT.IMPORTANT_BRIDGE;
    }
    
    // Highlight regular bridge channels
    if (edge.is_bridge_channel) {
        return EDGE_HIGHLIGHT.REGULAR_BRIDGE;
    }
    
    // Default color
    return EDGE_HIGHLIGHT.DEFAULT;
}

/**
 * Gets node color based on cluster or pre-calculated color
 * @param {Object} node - Node data object
 * @returns {string} Color hex code
 */
function getNodeColor(node) {
    // Use cluster-based coloring
    if (node.cluster !== undefined && node.cluster !== null) {
        return CLUSTER_COLORS[node.cluster] || CLUSTER_COLORS.DEFAULT;
    }
    
    // Default color
    return CLUSTER_COLORS.DEFAULT;
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Entry point: Loads JSON data from server and initializes the visualization
 * Handles network errors and displays error messages to user
 * @param {string} jsonFile - Path to JSON file containing graph data
 * @returns {Promise} Resolves when visualization is complete
 */
async function initVisualization(jsonFile) {
    // Destroy any existing visualization before creating a new one
    await destroyVisualization();

    // Load the JSON data
    return fetch(jsonFile)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ${jsonFile}: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Initialize the visualization with the loaded data
            createVisualization(data, jsonFile);
            console.log('📈 Visualization created');
        })
        .catch(error => {
            console.error('Error loading JSON data:', error);
            const graphContainer = document.getElementById('graph-container');
            if (graphContainer) {
                graphContainer.innerHTML = 
                    `<div style="padding: 20px; color: red;">Error loading data: ${error.message}</div>`;
            }
            throw error;
        });
}

// =============================================================================
// TOOLTIP AND SIDEBAR MANAGEMENT
// =============================================================================

/**
 * Manages tooltip display and positioning for node/edge hover effects
 * Shows enhanced network analysis metrics
 * @param {HTMLElement} tooltipElement - DOM element for tooltip display
 * @returns {Object} API for tooltip operations
 */
function createTooltipManager(tooltipElement) {
    let currentHover = null;
    
    function show(content, event) {
        currentHover = true;
        tooltipElement.innerHTML = content;
        tooltipElement.style.display = 'block';
        position(event);
    }
    
    function hide() {
        currentHover = null;
        tooltipElement.style.display = 'none';
    }
    
    function position(event) {
        const x = event.x + TIMING.TOOLTIP_OFFSET;
        const y = event.y + TIMING.TOOLTIP_OFFSET;
        tooltipElement.style.left = x + 'px';
        tooltipElement.style.top = y + 'px';
    }
    
    function createNodeTooltip(nodeAttributes) {
        const attrs = nodeAttributes.attributes;
        let bridgeInfo = '';
        
        if (attrs.isImportantBridgeNode) {
            bridgeInfo = '<div style="color: #FF0000; font-weight: bold;">🌉 Critical Bridge Node</div>';
        } else if (attrs.isBridgeNode) {
            bridgeInfo = '<div style="color: #FFA500; font-weight: bold;">🌉 Bridge Node</div>';
        }
                
        return `
            <div><strong>${nodeAttributes.label}</strong></div>
            ${bridgeInfo}

            <div>Capacity: ${attrs.totalCapacity}</div>
            <div>Channels: ${attrs.totalChannels}</div>
            <div>Pleb Rank: ${attrs.plebRank}</div>
            <div>Type: ${attrs.nodeType || 'Unknown'}</div>

        `;
    }
    
    function createEdgeTooltip(edgeAttributes, graph, edgeId) {
        const attrs = edgeAttributes.attributes;
        const sourceNode = graph.getNodeAttributes(graph.source(edgeId));
        const targetNode = graph.getNodeAttributes(graph.target(edgeId));
        
        let bridgeInfo = '';
        if (attrs.isImportantBridgeChannel) {
            bridgeInfo = '<div style="color: #FF0000; font-weight: bold;">🌉 Critical Bridge Channel</div>';
        } else if (attrs.isBridgeChannel) {
            bridgeInfo = '<div style="color: #FFA500; font-weight: bold;">🌉 Bridge Channel</div>';
        }
        
        return `
            <div><strong>Channel</strong></div>
            ${bridgeInfo}
            <div>From: ${sourceNode.label}</div>
            <div>To: ${targetNode.label}</div>
            <div>Capacity: ${formatCapacity(attrs.capacity)}</div>
            <div>Type: ${attrs.channelSizeTier}</div>
        `;
    }
    
    return { show, hide, position, createNodeTooltip, createEdgeTooltip, get currentHover() { return currentHover; } };
}

/**
 * Manages sidebar information panel updates when nodes/edges are clicked
 * Shows enhanced network analysis metrics
 * @returns {Object} API for sidebar operations
 */
function createSidebarManager() {
    function updateNodeInfo(nodeAttributes) {
        const attrs = nodeAttributes.attributes;
        
        let categoryCountsHtml = '';
        try {
            const categoryCountsObj = typeof attrs.categoryCount === 'string' 
                ? JSON.parse(attrs.categoryCount) 
                : attrs.categoryCount;
                
            if (categoryCountsObj && typeof categoryCountsObj === 'object') {
                for (const [category, count] of Object.entries(categoryCountsObj)) {
                    categoryCountsHtml += `<div><span class="info-label">${category}:</span> ${count}</div>`;
                }
            } else {
                categoryCountsHtml = `<div>${attrs.categoryCount || 'N/A'}</div>`;
            }
        } catch (e) {
            categoryCountsHtml = `<div>${attrs.categoryCount || 'N/A'}</div>`;
        }
        
        // Bridge node information
        let bridgeInfo = '';
        if (attrs.isImportantBridgeNode) {
            bridgeInfo = `
                <div style="margin-top: 10px; padding: 10px; background: rgba(255, 0, 0, 0.1); border-left: 3px solid #FF0000;">
                    <div style="font-weight: bold; color: #FF0000;">🌉 Critical Bridge Node</div>
                    <div><span class="info-label">Bridges Clusters:</span> ${attrs.bridgesClusters || 'N/A'}</div>
                    <div><span class="info-label">Cluster Connections:</span> ${attrs.clusterConnections || 'N/A'}</div>
                </div>
            `;
        } else if (attrs.isBridgeNode) {
            bridgeInfo = `
                <div style="margin-top: 10px; padding: 10px; background: rgba(255, 165, 0, 0.1); border-left: 3px solid #FFA500;">
                    <div style="font-weight: bold; color: #FFA500;">🌉 Bridge Node</div>
                    <div><span class="info-label">Bridges Clusters:</span> ${attrs.bridgesClusters || 'N/A'}</div>
                    <div><span class="info-label">Cluster Connections:</span> ${attrs.clusterConnections || 'N/A'}</div>
                </div>
            `;
        }
        
        // Cluster information
        let clusterInfo = '';
        if (attrs.cluster !== undefined && attrs.cluster !== null) {
            clusterInfo = `<div><span class="info-label">Cluster:</span> ${attrs.cluster}</div>`;
        }
        
        // Closed channels
        let closedChannelsInfo = '';
        if (attrs.closedChannelsCount !== undefined && attrs.closedChannelsCount !== null) {
            closedChannelsInfo = `<div><span class="info-label">Closed Channels:</span> ${attrs.closedChannelsCount}</div>`;
        }

        document.getElementById('node-info').innerHTML = `
            <div class="info-title">${nodeAttributes.label}</div>
            <div class="info-content">
                ${clusterInfo}
                <div><span class="info-label">Type:</span> ${attrs.nodeType || 'Unknown'}</div>
                <div><span class="info-label">Total Capacity:</span> ${attrs.totalCapacity}</div>
                <div><span class="info-label">Total Channels:</span> ${attrs.totalChannels}</div>
                ${closedChannelsInfo}
                <div><span class="info-label">Pleb Rank:</span> ${attrs.plebRank}</div>
                <div><span class="info-label">Capacity Rank:</span> ${attrs.capacityRank}</div>
                <div><span class="info-label">Channels Rank:</span> ${attrs.channelsRank}</div>
                <div><span class="info-label">Public Key:</span> ${attrs.pubKey}</div>
                <div><span class="info-label">Birth Transaction:</span> ${attrs.birthTx || 'N/A'}</div>
                ${bridgeInfo}
                <div style="margin-top: 10px;"><span class="info-label">Channel Categories:</span></div>
                ${categoryCountsHtml}
            </div>
        `;
    }
    
    function updateEdgeInfo(edgeAttributes, graph, edgeId) {
        const attrs = edgeAttributes.attributes;
        const sourceNode = graph.getNodeAttributes(graph.source(edgeId));
        const targetNode = graph.getNodeAttributes(graph.target(edgeId));
        
        // Bridge channel information
        let bridgeInfo = '';
        if (attrs.isImportantBridgeChannel) {
            bridgeInfo = `
                <div style="margin-top: 10px; padding: 10px; background: rgba(255, 0, 0, 0.1); border-left: 3px solid #FF0000;">
                    <div style="font-weight: bold; color: #FF0000;">🌉 Critical Bridge Channel</div>
                    <div><span class="info-label">Connects Clusters:</span> ${attrs.connectsClusters || 'N/A'}</div>
                </div>
            `;
        } else if (attrs.isBridgeChannel) {
            bridgeInfo = `
                <div style="margin-top: 10px; padding: 10px; background: rgba(255, 165, 0, 0.1); border-left: 3px solid #FFA500;">
                    <div style="font-weight: bold; color: #FFA500;">🌉 Bridge Channel</div>
                    <div><span class="info-label">Connects Clusters:</span> ${attrs.connectsClusters || 'N/A'}</div>
                </div>
            `;
        }

        document.getElementById('edge-info').innerHTML = `
            <div class="info-title">Channel Details</div>
            <div class="info-content">
                <div><span class="info-label">From:</span> ${sourceNode.label}</div>
                <div><span class="info-label">To:</span> ${targetNode.label}</div>
                <div><span class="info-label">Capacity:</span> ${formatCapacity(attrs.capacity)}</div>
                <div><span class="info-label">Channel Size Tier:</span> ${attrs.channelSizeTier}</div>
                ${bridgeInfo}
            </div>
        `;
    }
    
    function reset() {
        document.getElementById('node-info').innerHTML = `
            <div class="info-title">Node Information</div>
            <div class="info-content">Select a node to see details</div>
        `;
        document.getElementById('edge-info').innerHTML = `
            <div class="info-title">Channel Information</div>
            <div class="info-content">Select a channel to see details</div>
        `;
    }
    
    return { updateNodeInfo, updateEdgeInfo, reset };
}

/**
 * Sets up all mouse and click event handlers for the graph visualization
 * Implements Sigma.js demo-style node selection with edge highlighting
 * @param {Object} renderer - Sigma.js renderer instance
 * @param {Object} graph - Graphology graph instance
 * @param {Object} tooltipManager - Tooltip management API
 * @param {Object} sidebarManager - Sidebar management API
 */
function setupEventHandlers(renderer, graph, tooltipManager, sidebarManager) {
    // State reducer for graph display based on selection
    // This follows the Sigma.js demo pattern for node selection highlighting
    renderer.setSetting('nodeReducer', (node, data) => {
        const res = { ...data };
        
        if (selectedNode) {
            // If a node is selected, dim all nodes except selected and its neighbors
            if (node === selectedNode || graph.hasEdge(node, selectedNode) || graph.hasEdge(selectedNode, node)) {
                // Selected node and neighbors remain normal
                res.highlighted = true;
            } else {
                // Other nodes are dimmed
                res.color = '#E0E0E0';
                res.highlighted = false;
            }
        }
        
        return res;
    });
    
    renderer.setSetting('edgeReducer', (edge, data) => {
        const res = { ...data };
        
        if (selectedNode) {
            // Only show edges connected to the selected node
            const source = graph.source(edge);
            const target = graph.target(edge);
            
            if (source === selectedNode || target === selectedNode) {
                // Connected edges are highlighted with brighter color
                res.hidden = false;
                res.color = '#000000';  // Black for highlighted edges (like Sigma.js demo)
                res.size = Math.max(res.size || 1, 2);  // Make connected edges slightly thicker
            } else {
                // Other edges are hidden
                res.hidden = true;
            }
        }
        
        return res;
    });
    
    // Tooltip handlers
    renderer.on('enterNode', event => {
        const nodeAttributes = graph.getNodeAttributes(event.node);
        const content = tooltipManager.createNodeTooltip(nodeAttributes);
        tooltipManager.show(content, event);
    });

    renderer.on('leaveNode', () => {
        tooltipManager.hide();
    });

    renderer.on('enterEdge', event => {
        const edgeAttributes = graph.getEdgeAttributes(event.edge);
        const content = tooltipManager.createEdgeTooltip(edgeAttributes, graph, event.edge);
        tooltipManager.show(content, event);
    });

    renderer.on('leaveEdge', () => {
        tooltipManager.hide();
    });

    // Mouse move for tooltip positioning
    renderer.getMouseCaptor().on('mousemove', event => {
        if (tooltipManager.currentHover) {
            tooltipManager.position(event);
        }
    });

    // Click handlers - Sigma.js demo style
    renderer.on('clickNode', event => {
        const nodeAttributes = graph.getNodeAttributes(event.node);
        sidebarManager.updateNodeInfo(nodeAttributes);
        
        // Toggle node selection - clicking same node deselects it
        if (selectedNode === event.node) {
            selectedNode = null;
        } else {
            selectedNode = event.node;
        }
        
        // Refresh renderer to apply the reducers
        renderer.refresh();
    });
    
    // Click on stage (background) to deselect
    renderer.on('clickStage', () => {
        if (selectedNode) {
            selectedNode = null;
            sidebarManager.reset();
            renderer.refresh();
        }
    });

    renderer.on('clickEdge', event => {
        const edgeAttributes = graph.getEdgeAttributes(event.edge);
        sidebarManager.updateEdgeInfo(edgeAttributes, graph, event.edge);
    });
}

// =============================================================================
// LAYOUT MANAGEMENT
// =============================================================================

/**
 * Manages ForceAtlas2 layout algorithm execution and graph positioning
 * @param {Object} graph - Graphology graph instance
 * @param {Object} renderer - Sigma.js renderer instance  
 * @param {Array} nodes - Original node data for position tracking
 * @param {Map} originalPositions - Map storing initial node positions for reset
 * @returns {Object} Layout control API
 */
function createLayoutManager(graph, renderer, nodes, originalPositions) {
    let isRunning = false;
    let intervalId = null;
    
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    function centerNodes() {
        const positions = [];
        nodes.forEach(node => {
            if (graph.hasNode(node.id)) {
                const currentX = graph.getNodeAttribute(node.id, 'x');
                const currentY = graph.getNodeAttribute(node.id, 'y');
                positions.push({ x: currentX, y: currentY });
            }
        });
        
        if (positions.length === 0) return;
        
        let avgX = positions.reduce((sum, pos) => sum + pos.x, 0) / positions.length;
        let avgY = positions.reduce((sum, pos) => sum + pos.y, 0) / positions.length;
        
        const shiftX = 500 - avgX;
        const shiftY = 500 - avgY;
        
        nodes.forEach(node => {
            if (graph.hasNode(node.id)) {
                const currentX = graph.getNodeAttribute(node.id, 'x');
                const currentY = graph.getNodeAttribute(node.id, 'y');
                
                const newX = currentX + shiftX;
                const newY = currentY + shiftY;
                
                graph.setNodeAttribute(node.id, 'x', newX);
                graph.setNodeAttribute(node.id, 'y', newY);
                
                originalPositions.set(node.id, { x: newX, y: newY });
            }
        });
    }
    
    function autoFit() {
        const camera = renderer.getCamera();
        camera.animatedReset({ duration: 500 });
    }
    
    async function finalizeLayout() {
        await delay(300);
        centerNodes();
        renderer.refresh();
        await delay(200);
        autoFit();
    }
    
    async function initializePositions() {
        await delay(100);
        centerNodes();
        renderer.refresh();
    }
    
    function start(forceAtlas2, settings, toggleBtn) {
        if (isRunning) return;
        
        isRunning = true;
        toggleBtn.innerHTML = '<i class="fas fa-pause"></i> Stop Layout';
        
        try {
            const runIteration = () => {
                if (!isRunning) return;
                
                try {
                    forceAtlas2.assign(graph, settings);
                    renderer.refresh();
                } catch (error) {
                    stop(toggleBtn);
                }
            };
            
            intervalId = setInterval(runIteration, 100);
            
            // Auto-stop and finalize
            setTimeout(async () => {
                if (isRunning) {
                    stop(toggleBtn);
                    await finalizeLayout();
                }
            }, 8000);
            
        } catch (error) {
            stop(toggleBtn);
        }
    }
    
    function stop(toggleBtn) {
        isRunning = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        toggleBtn.innerHTML = '<i class="fas fa-play"></i> Start Layout';
    }
    
    function reset() {
        if (isRunning) {
            stop(document.getElementById('toggle-layout'));
        }
        
        // Restore original positions
        originalPositions.forEach((position, nodeId) => {
            if (graph.hasNode(nodeId)) {
                graph.setNodeAttribute(nodeId, 'x', position.x);
                graph.setNodeAttribute(nodeId, 'y', position.y);
            }
        });
    }
    
    return {
        start,
        stop,
        reset,
        initializePositions,
        get isRunning() { return isRunning; }
    };
}

// =============================================================================
// MAIN VISUALIZATION CREATION
// =============================================================================

/**
 * Creates the complete interactive graph visualization from loaded data
 * Works with the new enhanced data format (snake_case fields, clusters, betweenness, etc.)
 * @param {Object} data - Parsed JSON data containing nodes and edges arrays
 * @param {string} jsonFile - Path to JSON file containing graph data
 */
function createVisualization(data, jsonFile) {
    // Initialize the graph
    const graph = new graphology.Graph();
    
    // Extract nodes and edges from the data
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    
    // Store original positions for proper reset functionality
    const originalPositions = new Map();
    
    // Calculate all statistics once
    const dataStats = calculateDataStats(nodes, edges);
    const sizeCalculators = createSizeCalculators(dataStats);

    // Build graph: Add nodes with calculated sizes and colors
    nodes.forEach(node => {
        // Extract node data (all in snake_case format)
        const totalChannels = node.total_channels || 0;
        const totalCapacity = node.total_capacity || 0;
        const formattedCapacity = node.formatted_total_capacity || formatCapacity(totalCapacity);
        const nodeType = node.node_type || 'Unknown';
        const channelSegment = node.channel_segment || 'Unknown';
        const categoryCount = node.category_counts || {};
        const plebRank = node.pleb_rank || 'N/A';
        const capacityRank = node.capacity_rank || 'N/A';
        const channelsRank = node.channels_rank || 'N/A';
        const pubKey = node.pub_key || node.id || '';
        
        // New enhanced data fields
        const cluster = node.cluster;
        const isBridgeNode = node.is_bridge_node || false;
        const isImportantBridgeNode = node.is_important_bridge_node || false;
        const bridgesClusters = node.bridges_clusters;
        const clusterConnections = node.cluster_connections;
        const nodeBetweenness = node.node_betweenness;
        const closedChannelsCount = node.closed_channels_count;
        
        // Use provided coordinates or generate random ones
        const x = node.x !== undefined ? node.x : Math.random() * 1000;
        const y = node.y !== undefined ? node.y : Math.random() * 1000;
        
        // Set node color (do not use color from data, only use cluster-based coloring)
        const nodeColor = node.cluster !== undefined && node.cluster !== null
            ? CLUSTER_COLORS[node.cluster] || CLUSTER_COLORS.DEFAULT
            : CLUSTER_COLORS.DEFAULT;
        
        // Calculate node size using only channel count (no betweenness)
        const nodeSize = sizeCalculators.nodeSize(totalChannels);
        
        graph.addNode(node.id, {
            x: x,
            y: y,
            size: nodeSize,
            label: node.label || node.alias || node.id,
            color: nodeColor,
            // Border for bridge nodes
            borderColor: isImportantBridgeNode ? BRIDGE_NODE_CONFIG.IMPORTANT_BRIDGE.borderColor :
                        isBridgeNode ? BRIDGE_NODE_CONFIG.REGULAR_BRIDGE.borderColor : undefined,
            borderSize: isImportantBridgeNode ? BRIDGE_NODE_CONFIG.IMPORTANT_BRIDGE.borderWidth :
                       isBridgeNode ? BRIDGE_NODE_CONFIG.REGULAR_BRIDGE.borderWidth : 0,
            // Store all attributes for display
            attributes: {
                alias: node.alias,
                nodeType: nodeType,
                totalCapacity: formattedCapacity,
                totalChannels: totalChannels,
                channelSegment: channelSegment,
                categoryCount: categoryCount,
                plebRank: plebRank,
                capacityRank: capacityRank,
                channelsRank: channelsRank,
                pubKey: pubKey,
                cluster: cluster,
                isBridgeNode: isBridgeNode,
                isImportantBridgeNode: isImportantBridgeNode,
                bridgesClusters: bridgesClusters,
                clusterConnections: clusterConnections,
                nodeBetweenness: nodeBetweenness,
                closedChannelsCount: closedChannelsCount,
                birthTx: node.birth_tx
            }
        });
        
        // Store original position for reset functionality
        originalPositions.set(node.id, { x: x, y: y });
    });

    // Build graph: Add edges with dynamic coloring
    edges.forEach(edge => {
        try {
            // Extract edge data (all in snake_case format)
            const channelSizeTier = edge.channel_size_tier || 'Unknown';
            const channelSizeRange = edge.channel_size_range || 'Unknown';
            
            // New enhanced data fields
            const isBridgeChannel = edge.is_bridge_channel || false;
            const isImportantBridgeChannel = edge.is_important_bridge_channel || false;
            const connectsClusters = edge.connects_clusters;
            const edgeBetweenness = edge.edge_betweenness;
            
            // Get edge color (do not use color from data, only use bridge/highlight logic)
            const color = edge.is_important_bridge_channel ? EDGE_HIGHLIGHT.IMPORTANT_BRIDGE :
                          edge.is_bridge_channel ? EDGE_HIGHLIGHT.REGULAR_BRIDGE :
                          EDGE_HIGHLIGHT.DEFAULT;
            
            // Calculate edge width using only capacity (no betweenness)
            const edgeWidth = sizeCalculators.edgeWidth(edge.capacity);
            
            graph.addEdge(edge.source, edge.target, {
                size: edgeWidth,
                color: color,
                type: edge.type || 'line',
                // Store all attributes for display
                attributes: {
                    id: edge.id,
                    channelSizeTier: channelSizeTier,
                    channelSizeRange: channelSizeRange,
                    capacity: edge.capacity,
                    isBridgeChannel: isBridgeChannel,
                    isImportantBridgeChannel: isImportantBridgeChannel,
                    connectsClusters: connectsClusters,
                    edgeBetweenness: edgeBetweenness
                }
            });
        } catch (e) {
            console.error("Error adding edge:", e, edge);
        }
    });

    // Initialize Sigma.js renderer
    const container = document.getElementById('graph-container');
    const renderer = new Sigma(graph, container, {
        renderEdgeLabels: false,
        labelSize: 12,
        labelColor: { color: '#000' },
        nodeHoverColor: 'default',
        edgeHoverColor: 'default', 
        defaultEdgeHoverColor: '#000',
        defaultNodeHoverColor: '#000',
        labelDensity: 0.07,
        labelGridCellSize: 60,
        labelRenderedSizeThreshold: 6,
        enableEdgeEvents: true,
        enableEdgeHoverEvents: 'debounce',
        enableEdgeClickEvents: true,
        defaultEdgeType: "line",
        minEdgeSize: 0.2,
        maxEdgeSize: 2
    });

    // Track the current renderer globally for cleanup
    currentRenderer = renderer;

    // Initialize layout management system
    const layoutManager = createLayoutManager(graph, renderer, nodes, originalPositions);
    currentLayoutManager = layoutManager;

    // Apply initial node centering when visualization loads
    layoutManager.initializePositions();

    // Initialize UI management systems
    const tooltip = document.getElementById('tooltip');
    const tooltipManager = createTooltipManager(tooltip);
    const sidebarManager = createSidebarManager();
    
    // Set up all event handlers for user interactions
    setupEventHandlers(renderer, graph, tooltipManager, sidebarManager);

    // Search functionality: filters graph based on multiple node fields matching
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', event => {
            const query = event.target.value.toLowerCase();

            if (query.length < TIMING.SEARCH_MIN_LENGTH) {
                // Reset all nodes visibility
                graph.forEachNode(node => {
                    graph.setNodeAttribute(node, 'hidden', false);
                });
                graph.forEachEdge(edge => {
                    graph.setEdgeAttribute(edge, 'hidden', false);
                });
                renderer.refresh();
                return;
            }

            // Hide all nodes and edges first
            graph.forEachNode(node => {
                graph.setNodeAttribute(node, 'hidden', true);
            });
            graph.forEachEdge(edge => {
                graph.setEdgeAttribute(edge, 'hidden', true);
            });

            // Enhanced search with multiple criteria
            const searchTerms = query.split(' ').filter(term => term.length > 0);
            const matchingNodes = new Set();
            const originalMatchingNodes = new Set();

            graph.forEachNode(node => {
                const nodeAttributes = graph.getNodeAttributes(node);
                const attrs = nodeAttributes.attributes;
                
                // Multi-field search
                const basicSearchableText = [
                    nodeAttributes.label || '',
                    attrs.alias || '',
                    attrs.nodeType || '',
                    attrs.channelSegment || '',
                    attrs.pubKey || ''
                ].join(' ').toLowerCase();
                
                // Add channel categories from category counts (only if count > 0)
                let channelTypesText = '';
                try {
                    const categoryCountsObj = typeof attrs.categoryCount === 'string' 
                        ? JSON.parse(attrs.categoryCount) 
                        : attrs.categoryCount;
                        
                    if (categoryCountsObj && typeof categoryCountsObj === 'object') {
                        const activeChannelTypes = Object.keys(categoryCountsObj)
                            .filter(channelType => categoryCountsObj[channelType] > 0)
                            .map(channelType => channelType.toLowerCase());
                        channelTypesText = activeChannelTypes.join(' ');
                    }
                } catch (e) {
                    channelTypesText = '';
                }
                
                // Add cluster if available
                let clusterText = '';
                if (attrs.cluster !== undefined && attrs.cluster !== null) {
                    clusterText = `cluster ${attrs.cluster}`;
                }
                
                // Combine all searchable text
                const searchableText = basicSearchableText + ' ' + channelTypesText + ' ' + clusterText;
                
                // Check if ALL search terms are found (AND logic)
                const isMatch = searchTerms.every(term => searchableText.includes(term));
                
                if (isMatch) {
                    graph.setNodeAttribute(node, 'hidden', false);
                    matchingNodes.add(node);
                    originalMatchingNodes.add(node);

                    // Show connected nodes and edges
                    graph.forEachNeighbor(node, neighbor => {
                        graph.setNodeAttribute(neighbor, 'hidden', false);
                        matchingNodes.add(neighbor);
                    });
                }
            });

            // Show edges ONLY if at least one end is an original matching node
            graph.forEachEdge(edge => {
                const source = graph.source(edge);
                const target = graph.target(edge);
                
                if ((originalMatchingNodes.has(source) || originalMatchingNodes.has(target)) &&
                    matchingNodes.has(source) && matchingNodes.has(target)) {
                    graph.setEdgeAttribute(edge, 'hidden', false);
                }
            });

            renderer.refresh();
        });
    }

    // Setup control buttons only once
    if (!controlButtonListeners.zoomIn) {
        // Zoom controls
        const zoomInBtn = document.getElementById('zoom-in');
        if (zoomInBtn) {
            controlButtonListeners.zoomIn = () => {
                if (currentRenderer) {
                    const camera = currentRenderer.getCamera();
                    camera.animatedZoom({ duration: TIMING.ZOOM_ANIMATION });
                }
            };
            zoomInBtn.addEventListener('click', controlButtonListeners.zoomIn);
        }

        const zoomOutBtn = document.getElementById('zoom-out');
        if (zoomOutBtn) {
            controlButtonListeners.zoomOut = () => {
                if (currentRenderer) {
                    const camera = currentRenderer.getCamera();
                    camera.animatedUnzoom({ duration: TIMING.ZOOM_ANIMATION });
                }
            };
            zoomOutBtn.addEventListener('click', controlButtonListeners.zoomOut);
        }

        // Reset view functionality
        const resetViewBtn = document.getElementById('reset-view');
        if (resetViewBtn) {
            controlButtonListeners.resetView = () => {
                if (!currentRenderer || !currentLayoutManager) return;
                
                const camera = currentRenderer.getCamera();
                
                // Use layout manager for reset
                currentLayoutManager.reset();
                
                // Reset any node/edge filtering
                selectedNode = null;
                const graph = currentRenderer.getGraph();
                graph.forEachNode(node => {
                    graph.setNodeAttribute(node, 'hidden', false);
                });
                graph.forEachEdge(edge => {
                    graph.setEdgeAttribute(edge, 'hidden', false);
                });
                
                // Clear search input
                const searchInput = document.getElementById('search-input');
                if (searchInput) {
                    searchInput.value = '';
                }
                
                // Reset sidebar information
                document.getElementById('node-info').innerHTML = `
                    <div class="info-title">Node Information</div>
                    <div class="info-content">Select a node to see details</div>
                `;
                document.getElementById('edge-info').innerHTML = `
                    <div class="info-title">Channel Information</div>
                    <div class="info-content">Select a channel to see details</div>
                `;
                
                camera.animatedReset({ duration: TIMING.ZOOM_ANIMATION });
                currentRenderer.refresh();
            };
            resetViewBtn.addEventListener('click', controlButtonListeners.resetView);
        }
    }

    // ForceAtlas2 layout integration
    const forceAtlas2 = window.graphologyLibrary?.layoutForceAtlas2 || 
                       window.graphology?.layoutForceAtlas2 ||
                       (typeof graphologyLayoutForceAtlas2 !== 'undefined' ? graphologyLayoutForceAtlas2 : null);

    if (!forceAtlas2) {
        // Handle missing layout library
        const toggleLayoutBtn = document.getElementById('toggle-layout');
        if (toggleLayoutBtn) {
            toggleLayoutBtn.disabled = true;
            toggleLayoutBtn.innerHTML = '<i class="fas fa-times"></i> Layout Unavailable';
            toggleLayoutBtn.style.opacity = '0.5';
            toggleLayoutBtn.style.cursor = 'not-allowed';
        }
    } else {
        // ForceAtlas2 layout settings
        const layoutSettings = {
            iterations: 1,
            gravity: 0.4,
            scalingRatio: 60,
            strongGravityMode: false,
            slowDown: 1.2,
            barnesHutOptimize: true,
            barnesHutTheta: 0.5,
            adjustSizes: false,
            edgeWeightInfluence: 0.15
        };

        // Set up layout control button
        const toggleLayoutBtn = document.getElementById('toggle-layout');
        if (toggleLayoutBtn) {
            controlButtonListeners.toggleLayout = () => {
                if (layoutManager.isRunning) {
                    layoutManager.stop(toggleLayoutBtn);
                } else {
                    layoutManager.start(forceAtlas2, layoutSettings, toggleLayoutBtn);
                }
            };
            toggleLayoutBtn.addEventListener('click', controlButtonListeners.toggleLayout);
        }
    }

    // Update statistics display
    document.getElementById('node-count').textContent = graph.order;
    document.getElementById('edge-count').textContent = graph.size;
    document.getElementById('total-capacity').textContent = formatCapacity(dataStats.totalCapacity);

    // Channel size distribution statistics
    document.getElementById('capacity-min').textContent = formatCapacity(dataStats.channelSize.min);
    document.getElementById('capacity-q25').textContent = formatCapacity(dataStats.channelSize.q25);
    document.getElementById('capacity-median').textContent = formatCapacity(dataStats.channelSize.median);
    document.getElementById('capacity-q75').textContent = formatCapacity(dataStats.channelSize.q75);
    document.getElementById('capacity-max').textContent = formatCapacity(dataStats.channelSize.max);
    document.getElementById('capacity-avg').textContent = formatCapacity(Math.round(dataStats.channelSize.avg));

    // Channel count distribution statistics
    document.getElementById('channels-min').textContent = Math.floor(dataStats.channels.min).toLocaleString();
    document.getElementById('channels-q25').textContent = Math.floor(dataStats.channels.q25).toLocaleString();
    document.getElementById('channels-median').textContent = Math.floor(dataStats.channels.median).toLocaleString();
    document.getElementById('channels-q75').textContent = Math.floor(dataStats.channels.q75).toLocaleString();
    document.getElementById('channels-max').textContent = Math.floor(dataStats.channels.max).toLocaleString();
    document.getElementById('channels-avg').textContent = Math.floor(dataStats.channels.avg).toLocaleString();

    // Node capacity distribution statistics
    document.getElementById('node-capacity-min').textContent = formatCapacity(dataStats.nodeCapacity.min);
    document.getElementById('node-capacity-q25').textContent = formatCapacity(dataStats.nodeCapacity.q25);
    document.getElementById('node-capacity-median').textContent = formatCapacity(dataStats.nodeCapacity.median);
    document.getElementById('node-capacity-q75').textContent = formatCapacity(dataStats.nodeCapacity.q75);
    document.getElementById('node-capacity-max').textContent = formatCapacity(dataStats.nodeCapacity.max);
    document.getElementById('node-capacity-avg').textContent = formatCapacity(Math.round(dataStats.nodeCapacity.avg));
}
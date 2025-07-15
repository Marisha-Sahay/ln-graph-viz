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

// =============================================================================
// GLOBAL STATE
// =============================================================================

// Global state for tracking selected node (used for gray-out effect on edges)
let selectedNode = null;

// =============================================================================
// DATA PROCESSING UTILITIES
// =============================================================================

/**
 * Calculates comprehensive statistics including percentiles for capacity and channels
 * This function processes all nodes and edges once to determine scaling ranges and distributions
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
        .map(node => node.Total_Channels || 0)
        .filter(channels => channels > 0)
        .sort((a, b) => a - b);
    
    const channelStats = calculatePercentiles(nodeChannels);
    
    // 3. Node capacity distribution (use existing calculated values)
    const nodeCapacities = nodes
        .map(node => node.Total_Capacity || 0)
        .filter(capacity => capacity > 0)
        .sort((a, b) => a - b);
    
    const nodeCapacityStats = calculatePercentiles(nodeCapacities);
    
    // Calculate total capacity from node totals 
    const totalCapacity = nodeCapacities.reduce((sum, capacity) => sum + capacity, 0)/2;
    
    // Return enhanced statistics object with backward compatibility
    return {
        // Original structure for backward compatibility (used by existing scaling functions)
        nodes: { 
            min: channelStats.min || 1, 
            max: channelStats.max || 1 
        },
        edges: { 
            min: channelSizeStats.min || 1, 
            max: channelSizeStats.max || 1 
        },
        totalCapacity: totalCapacity,
        
        // Enhanced statistics - renamed for clarity
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
        // Node capacity distribution from existing data
        nodeCapacity: {
            min: nodeCapacityStats.min,
            q25: nodeCapacityStats.q25,
            median: nodeCapacityStats.median,
            q75: nodeCapacityStats.q75,
            max: nodeCapacityStats.max,
            avg: nodeCapacityStats.avg,
            count: nodeCapacities.length
        }
    };
}

/**
 * Creates reusable calculators for consistent node/edge sizing across the graph
 * Uses logarithmic scaling to handle wide range of values (channels: 1-2000+, capacity: 1K-1B+ sats)
 * @param {Object} dataStats - Pre-calculated statistics from calculateDataStats
 * @returns {Object} Calculator functions for nodeSize, edgeWidth, and edgeStyle
 */
function createSizeCalculators(dataStats) {
    const { nodes: nodeStats, edges: edgeStats } = dataStats;
    
    return {
        nodeSize: (totalChannels) => {
            if (!totalChannels || !nodeStats.max) return 3;
            const normalizedValue = (Math.log(Math.max(totalChannels, 1)) - Math.log(Math.max(nodeStats.min, 1))) / 
                                  (Math.log(nodeStats.max) - Math.log(Math.max(nodeStats.min, 1)));
            return 3 + normalizedValue * (15 - 3);
        },
        
        edgeWidth: (capacity) => {
            if (!capacity || !edgeStats.max) return 0.2;
            const normalizedValue = (Math.log(Math.max(capacity, 1)) - Math.log(Math.max(edgeStats.min, 1))) / 
                                  (Math.log(edgeStats.max) - Math.log(Math.max(edgeStats.min, 1)));
            return 0.2 + normalizedValue * (2 - 0.2);
        },
        
        edgeStyle: (capacity) => {
            if (!capacity || !edgeStats.max) return { type: "dashed" };
            const range = edgeStats.max - edgeStats.min;
            const normalizedCapacity = (capacity - edgeStats.min) / range;
            return normalizedCapacity <= 0.5 ? { type: "dashed" } : { type: "line" };
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
// MAIN FUNCTIONS - Using centralized data processing
// =============================================================================

// Main visualization function that loads JSON data and initializes the graph
/**
 * Entry point: Loads JSON data from server and initializes the visualization
 * Handles network errors and displays error messages to user
 * @param {string} jsonFile - Path to JSON file containing graph data
 */
function initVisualization(jsonFile) {
    // Load the JSON data
    fetch(jsonFile)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ${jsonFile}: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Initialize the visualization with the loaded data
            createVisualization(data);
        })
        .catch(error => {
            console.error('Error loading JSON data:', error);
            document.getElementById('graph-container').innerHTML = 
                `<div style="padding: 20px; color: red;">Error loading data: ${error.message}</div>`;
        });
}

// =============================================================================
// PHASE 3: Event Handler Consolidation - Eliminate duplicate event patterns
// =============================================================================

/**
 * Manages tooltip display and positioning for node/edge hover effects
 * Handles showing, hiding, positioning, and content generation for tooltips
 * @param {HTMLElement} tooltipElement - DOM element for tooltip display
 * @returns {Object} API for tooltip operations (show, hide, position, create content)
 */
function createTooltipManager(tooltipElement) {
    let currentHover = null;
    
    /**
     * Shows tooltip with specified content at mouse position
     */
    function show(content, event) {
        currentHover = true;
        tooltipElement.innerHTML = content;
        tooltipElement.style.display = 'block';
        position(event);
    }
    
    /**
     * Hides tooltip and resets hover state
     */
    function hide() {
        currentHover = null;
        tooltipElement.style.display = 'none';
    }
    
    /**
     * Positions tooltip relative to mouse cursor with offset
     */
    function position(event) {
        const x = event.x + TIMING.TOOLTIP_OFFSET;
        const y = event.y + TIMING.TOOLTIP_OFFSET;
        tooltipElement.style.left = x + 'px';
        tooltipElement.style.top = y + 'px';
    }
    
    /**
     * Generates HTML content for node hover tooltips
     * Shows: node name, type, capacity, channel count
     */
    function createNodeTooltip(nodeAttributes) {
        const attrs = nodeAttributes.attributes;
        return `
            <div><strong>${nodeAttributes.label}</strong></div>
            <div>Type: ${attrs.nodeType || 'Unknown'}</div>
            <div>Capacity: ${attrs.totalCapacity}</div>
            <div>Channels: ${attrs.totalChannels}</div>
        `;
    }
    
    /**
     * Generates HTML content for edge hover tooltips
     * Shows: source node, target node, capacity, channel type
     */
    function createEdgeTooltip(edgeAttributes, graph, edgeId) {
        const attrs = edgeAttributes.attributes;
        const sourceNode = graph.getNodeAttributes(graph.source(edgeId));
        const targetNode = graph.getNodeAttributes(graph.target(edgeId));
        
        return `
            <div><strong>Channel</strong></div>
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
 * Generates detailed HTML content for node and channel information display
 * @returns {Object} API for sidebar operations (updateNodeInfo, updateEdgeInfo, reset)
 */
function createSidebarManager() {
    /**
     * Updates sidebar with detailed node information
     * Parses and displays category counts JSON data
     */
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

        document.getElementById('node-info').innerHTML = `
            <div class="info-title">${nodeAttributes.label}</div>
            <div class="info-content">
                <div><span class="info-label">Type:</span> ${attrs.nodeType || 'Unknown'}</div>
                <div><span class="info-label">Total Capacity:</span> ${attrs.totalCapacity}</div>
                <div><span class="info-label">Total Channels:</span> ${attrs.totalChannels}</div>
                <div><span class="info-label">Channel Segment:</span> ${attrs.channelSegment}</div>
                <div><span class="info-label">Pleb Rank:</span> ${attrs.plebRank}</div>
                <div><span class="info-label">Capacity Rank:</span> ${attrs.capacityRank}</div>
                <div><span class="info-label">Channels Rank:</span> ${attrs.channelsRank}</div>
                <div><span class="info-label">Public Key:</span> ${attrs.pubKey}</div>
                <div style="margin-top: 10px;"><span class="info-label">Channel Categories:</span></div>
                ${categoryCountsHtml}
            </div>
        `;
    }
    
    /**
     * Updates sidebar with detailed channel information
     * Shows source/target nodes and channel properties
     */
    function updateEdgeInfo(edgeAttributes, graph, edgeId) {
        const attrs = edgeAttributes.attributes;
        const sourceNode = graph.getNodeAttributes(graph.source(edgeId));
        const targetNode = graph.getNodeAttributes(graph.target(edgeId));

        document.getElementById('edge-info').innerHTML = `
            <div class="info-title">Channel Details</div>
            <div class="info-content">
                <div><span class="info-label">From:</span> ${sourceNode.label}</div>
                <div><span class="info-label">To:</span> ${targetNode.label}</div>
                <div><span class="info-label">Capacity:</span> ${formatCapacity(attrs.capacity)}</div>
                <div><span class="info-label">Channel Size Tier:</span> ${attrs.channelSizeTier}</div>
                <div><span class="info-label">Size Range:</span> ${attrs.channelSizeRange}</div>
                <div><span class="info-label">Channel ID:</span> ${attrs.id}</div>
            </div>
        `;
    }
    
    /**
     * Resets sidebar to default empty state
     */
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
 * Coordinates between tooltip manager, sidebar manager, and node selection
 * @param {Object} renderer - Sigma.js renderer instance
 * @param {Object} graph - Graphology graph instance
 * @param {Object} tooltipManager - Tooltip management API
 * @param {Object} sidebarManager - Sidebar management API
 */
function setupEventHandlers(renderer, graph, tooltipManager, sidebarManager) {
    // Consolidated tooltip handlers
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

    // Consolidated mouse move for tooltip positioning
    renderer.getMouseCaptor().on('mousemove', event => {
        if (tooltipManager.currentHover) {
            tooltipManager.position(event);
        }
    });

    // Consolidated click handlers
    renderer.on('clickNode', event => {
        const nodeAttributes = graph.getNodeAttributes(event.node);
        sidebarManager.updateNodeInfo(nodeAttributes);
        
        // Toggle node selection for gray-out effect
        selectedNode = selectedNode === event.node ? null : event.node;
        renderer.refresh();
        renderer.render();
    });

    renderer.on('clickEdge', event => {
        const edgeAttributes = graph.getEdgeAttributes(event.edge);
        sidebarManager.updateEdgeInfo(edgeAttributes, graph, event.edge);
    });
}

// =============================================================================
// PHASE 4: Layout MANAGEMENT
// =============================================================================

// =============================================================================
// GRAPH LAYOUT MANAGEMENT
// =============================================================================

/**
 * Manages ForceAtlas2 layout algorithm execution and graph positioning
 * Handles start/stop of physics simulation, node centering, and view auto-fitting
 * Replaces complex nested setTimeout chains with clean async operations
 * @param {Object} graph - Graphology graph instance
 * @param {Object} renderer - Sigma.js renderer instance  
 * @param {Array} nodes - Original node data for position tracking
 * @param {Map} originalPositions - Map storing initial node positions for reset
 * @returns {Object} Layout control API (start, stop, reset, initialize)
 */
function createLayoutManager(graph, renderer, nodes, originalPositions) {
    let isRunning = false;
    let intervalId = null;
    
    /**
     * Utility for clean async delays (replaces nested setTimeout)
     */
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Centers all nodes around point (500,500) while preserving relative positions
     * Calculates center of mass and shifts all nodes to desired center point
     */
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
    
    /**
     * Auto-fits camera view to show all nodes after layout completion
     */
    function autoFit() {
        const camera = renderer.getCamera();
        camera.animatedReset({ duration: 500 });
    }
    
    /**
     * Async sequence for layout completion: center → refresh → auto-fit
     * Replaces complex nested setTimeout chains with readable async/await
     */
    async function finalizeLayout() {
        await delay(300);
        centerNodes();
        renderer.refresh();
        await delay(200);
        autoFit();
    }
    
    /**
     * Initial positioning setup when visualization first loads
     */
    async function initializePositions() {
        await delay(100);
        centerNodes();
        renderer.refresh();
    }
    
    /**
     * Starts ForceAtlas2 physics simulation with auto-stop after 8 seconds
     * Runs layout iterations at 100ms intervals for smooth animation
     */
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
    
    /**
     * Stops layout algorithm and updates UI button state
     */
    function stop(toggleBtn) {
        isRunning = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        toggleBtn.innerHTML = '<i class="fas fa-play"></i> Start Layout';
    }
    
    /**
     * Resets all nodes to their original positions and stops any running layout
     */
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

/**
 * Creates the complete interactive graph visualization from loaded data
 * Orchestrates: data processing → graph building → rendering → UI setup → event handling
 * This is the main function that coordinates all other components
 * @param {Object} data - Parsed JSON data containing nodes and edges arrays
 */
function createVisualization(data) {
    // Initialize the graph
    const graph = new graphology.Graph();
    
    // Extract nodes and edges from the data
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    
    // Store original positions for proper reset functionality
    const originalPositions = new Map();
    
    // Calculate all statistics once using centralized data processing
    const dataStats = calculateDataStats(nodes, edges);
    const sizeCalculators = createSizeCalculators(dataStats);

    /**
     * Determines if an edge should be visible based on current filters
     * Currently shows all edges - extend this for capacity-based filtering
     */
    function shouldDisplayEdge(graph, edge, selectedNode = null) {
        return true;
    }

    /**
     * Maps Lightning Network node types to visual colors
     * Modify this function to change node color scheme
     */
    function getNodeColor(nodeType) {
        switch (nodeType) {
            case 'LSP': return '#4CAF50';
            case 'Exchange': return '#2196F3';
            case 'Wallet': return '#FFC107';
            case 'Payment': return '#9C27B0';
            case 'Routing': return '#FF5722';
            default: return '#607D8B';
        }
    }
    
    /**
     * Maps Lightning Network channel types to visual colors  
     * Modify this function to change edge color scheme
     */
    function getEdgeColor(channelType) {
        switch (channelType) {
            case 'Freeway': return '#E91E63';
            case 'Highway': return '#3F51B5';
            case 'My Way': return '#FF9800';  // Note: space in "My Way"
            default: return '#9E9E9E';
        }
    }

    // Build graph: Add nodes with calculated sizes and colors
    nodes.forEach(node => {
        // Set node color based on type if not already set
        if (!node.color) {
            node.color = getNodeColor(node.Node_Type);
        }
        
        const x = node.x || Math.random() * 1000;
        const y = node.y || Math.random() * 1000;
        
        graph.addNode(node.id, {
            x: x,
            y: y,
            size: sizeCalculators.nodeSize(node.Total_Channels),
            label: node.label || node.alias || node.id,
            color: node.color,
            // Store all attributes for display
            attributes: {
                alias: node.alias,
                nodeType: node.Node_Type || 'Unknown',
                totalCapacity: node.Formatted_Total_Capacity,
                totalChannels: node.Total_Channels,
                channelSegment: node.channel_segment,
                categoryCount: node.Category_Counts,
                plebRank: node.Pleb_Rank,
                capacityRank: node.Total_Capacity_Rank,
                channelsRank: node.Total_Channels_Rank,
                pubKey: node.pub_key
            }
        });
        
        // Store original position for reset functionality
        originalPositions.set(node.id, { x: x, y: y });
    });

    // Build graph: Add edges with calculated widths and colors
    edges.forEach(edge => {
        try {
            // Set edge color based on type if not already set
            if (!edge.color) {
                edge.color = getEdgeColor(edge.Channel_Size_Tier);
            }
            
            graph.addEdge(edge.source, edge.target, {
                size: sizeCalculators.edgeWidth(edge.capacity),
                color: edge.color,
                // Store all attributes for display
                attributes: {
                    id: edge.id,
                    channelSizeTier: edge.Channel_Size_Tier,
                    channelSizeRange: edge.Channel_Size_Range,
                    capacity: edge.capacity
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

    // Initialize layout management system
    const layoutManager = createLayoutManager(graph, renderer, nodes, originalPositions);

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
            
            // Simple multi-field search - just concatenate available fields
            const basicSearchableText = [
                nodeAttributes.label || '',
                attrs.alias || '',
                attrs.nodeType || '',
                attrs.channelSegment || '',
                attrs.pubKey || ''  // Include full pubkey instead of just first 8 chars
            ].join(' ').toLowerCase();
            
            // Add channel categories from category counts (only if count > 0)
            let channelTypesText = '';
            try {
                const categoryCountsObj = typeof attrs.categoryCount === 'string' 
                    ? JSON.parse(attrs.categoryCount) 
                    : attrs.categoryCount;
                    
                if (categoryCountsObj && typeof categoryCountsObj === 'object') {
                    // Only include channel types that have count > 0
                    const activeChannelTypes = Object.keys(categoryCountsObj)
                        .filter(channelType => categoryCountsObj[channelType] > 0)
                        .map(channelType => channelType.toLowerCase());
                    channelTypesText = activeChannelTypes.join(' ');
                }
            } catch (e) {
                // If parsing fails, continue without channel types
                channelTypesText = '';
            }
            
            // Combine all searchable text
            const searchableText = basicSearchableText + ' ' + channelTypesText;
            
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
            
            // Show edge ONLY if at least one end is an original matching node
            if ((originalMatchingNodes.has(source) || originalMatchingNodes.has(target)) &&
                matchingNodes.has(source) && matchingNodes.has(target)) {
                graph.setEdgeAttribute(edge, 'hidden', false);
            }
        });

        renderer.refresh();
    });

    // Zoom and camera controls setup
    document.getElementById('zoom-in').addEventListener('click', () => {
        const camera = renderer.getCamera();
        camera.animatedZoom({ duration: TIMING.ZOOM_ANIMATION });
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
        const camera = renderer.getCamera();
        camera.animatedUnzoom({ duration: TIMING.ZOOM_ANIMATION });
    });

    // Reset view functionality: restores original state
    document.getElementById('reset-view').addEventListener('click', () => {
        const camera = renderer.getCamera();
        
        // Use layout manager for reset
        layoutManager.reset();
        
        // Reset any node/edge filtering
        selectedNode = null;
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
        
        // Reset sidebar information using consolidated manager
        sidebarManager.reset();
        
        camera.animatedReset({ duration: TIMING.ZOOM_ANIMATION });
        renderer.refresh();
    });

    // ForceAtlas2 layout integration with availability checking
    const forceAtlas2 = window.graphologyLibrary?.layoutForceAtlas2 || 
                       window.graphology?.layoutForceAtlas2 ||
                       (typeof graphologyLayoutForceAtlas2 !== 'undefined' ? graphologyLayoutForceAtlas2 : null);
                       
    console.log('ForceAtlas2 availability check:', {
        graphologyLibrary: !!window.graphologyLibrary,
        layoutForceAtlas2: !!forceAtlas2,
        libraryKeys: window.graphologyLibrary ? Object.keys(window.graphologyLibrary) : 'No graphologyLibrary'
    });

    if (!forceAtlas2) {
        // Handle missing layout library: disable button and show error
        const toggleLayoutBtn = document.getElementById('toggle-layout');
        if (toggleLayoutBtn) {
            toggleLayoutBtn.disabled = true;
            toggleLayoutBtn.innerHTML = '<i class="fas fa-times"></i> Layout Unavailable';
            toggleLayoutBtn.style.opacity = '0.5';
            toggleLayoutBtn.style.cursor = 'not-allowed';
        }
    } else {
        // ForceAtlas2 layout settings - modify these to change physics behavior
        const layoutSettings = {
            iterations: 1,              // Layout iterations per step
            gravity: 0.4,               // Attraction to center
            scalingRatio: 60,           // Node repulsion strength
            strongGravityMode: false,   // Use linear or log gravity
            slowDown: 1.2,              // Damping factor
            barnesHutOptimize: true,    // Use Barnes-Hut approximation
            barnesHutTheta: 0.5,        // Barnes-Hut precision
            adjustSizes: false,         // Consider node sizes in physics
            edgeWeightInfluence: 0.15   // How much edge weights affect layout
        };

        // Set up layout control button
        const toggleLayoutBtn = document.getElementById('toggle-layout');
        if (toggleLayoutBtn) {
            toggleLayoutBtn.addEventListener('click', () => {
                if (layoutManager.isRunning) {
                    layoutManager.stop(toggleLayoutBtn);
                } else {
                    layoutManager.start(forceAtlas2, layoutSettings, toggleLayoutBtn);
                }
            });
        }
    }

    // Update statistics display using enhanced calculated values
    document.getElementById('node-count').textContent = graph.order;
    document.getElementById('edge-count').textContent = graph.size;
    document.getElementById('total-capacity').textContent = formatCapacity(dataStats.totalCapacity);

    // Update channel size distribution statistics (renamed from capacity to channelSize)
    document.getElementById('capacity-min').textContent = formatCapacity(dataStats.channelSize.min);
    document.getElementById('capacity-q25').textContent = formatCapacity(dataStats.channelSize.q25);
    document.getElementById('capacity-median').textContent = formatCapacity(dataStats.channelSize.median);
    document.getElementById('capacity-q75').textContent = formatCapacity(dataStats.channelSize.q75);
    document.getElementById('capacity-max').textContent = formatCapacity(dataStats.channelSize.max);
    document.getElementById('capacity-avg').textContent = formatCapacity(Math.round(dataStats.channelSize.avg));

    // Update channel count distribution statistics
    document.getElementById('channels-min').textContent = Math.floor(dataStats.channels.min).toLocaleString();
    document.getElementById('channels-q25').textContent = Math.floor(dataStats.channels.q25).toLocaleString();
    document.getElementById('channels-median').textContent = Math.floor(dataStats.channels.median).toLocaleString();
    document.getElementById('channels-q75').textContent = Math.floor(dataStats.channels.q75).toLocaleString();
    document.getElementById('channels-max').textContent = Math.floor(dataStats.channels.max).toLocaleString();
    document.getElementById('channels-avg').textContent = Math.floor(dataStats.channels.avg).toLocaleString();

    // Update node capacity distribution statistics
    document.getElementById('node-capacity-min').textContent = formatCapacity(dataStats.nodeCapacity.min);
    document.getElementById('node-capacity-q25').textContent = formatCapacity(dataStats.nodeCapacity.q25);
    document.getElementById('node-capacity-median').textContent = formatCapacity(dataStats.nodeCapacity.median);
    document.getElementById('node-capacity-q75').textContent = formatCapacity(dataStats.nodeCapacity.q75);
    document.getElementById('node-capacity-max').textContent = formatCapacity(dataStats.nodeCapacity.max);
    document.getElementById('node-capacity-avg').textContent = formatCapacity(Math.round(dataStats.nodeCapacity.avg));
}
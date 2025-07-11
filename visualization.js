// Constants for visualization
const MIN_NODE_SIZE = 3;
const MAX_NODE_SIZE = 15;
const MIN_EDGE_WIDTH = 0.2;
const MAX_EDGE_WIDTH = 2;

// Utility functions for size calculations
function calculateNodeSize(totalChannels, minChannels, maxChannels) {
    if (!totalChannels || !maxChannels) return MIN_NODE_SIZE;
    // Use log scale and handle edge cases
    const normalizedValue = (Math.log(Math.max(totalChannels, 1)) - Math.log(Math.max(minChannels, 1))) / 
                          (Math.log(maxChannels) - Math.log(Math.max(minChannels, 1)));
    return MIN_NODE_SIZE + normalizedValue * (MAX_NODE_SIZE - MIN_NODE_SIZE);
}

function calculateEdgeWidth(capacity, minCapacity, maxCapacity) {
    if (!capacity || !maxCapacity) return MIN_EDGE_WIDTH;
    // Use log scale and handle edge cases
    const normalizedValue = (Math.log(Math.max(capacity, 1)) - Math.log(Math.max(minCapacity, 1))) / 
                          (Math.log(maxCapacity) - Math.log(Math.max(minCapacity, 1)));
    return MIN_EDGE_WIDTH + normalizedValue * (MAX_EDGE_WIDTH - MIN_EDGE_WIDTH);
}

function shouldDisplayEdge(graph, edge, selectedNode = null) {
    if (selectedNode) {
        const source = graph.source(edge);
        const target = graph.target(edge);
        return source === selectedNode || target === selectedNode;
    }
    const edgeAttrs = graph.getEdgeAttributes(edge);
    const capacity = edgeAttrs.attributes?.capacity;
    const maxCapacity = edgeAttrs.attributes?.maxCapacity;
    return capacity > maxCapacity / 2;
}

function getEdgeStyle(capacity, minCapacity, maxCapacity) {
    if (!capacity || !maxCapacity) return { type: "dashed" };
    const range = maxCapacity - minCapacity;
    const normalizedCapacity = (capacity - minCapacity) / range;
    
    if (normalizedCapacity <= 0.25) {
        return { type: "dashed" };
    } else if (normalizedCapacity <= 0.5) {
        return { type: "dashed" };
    }
    return { type: "line" };
}

// Main visualization function that loads JSON data and initializes the graph
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

// Function to create the visualization with the loaded data
function createVisualization(data) {
    // Initialize the graph
    const graph = new graphology.Graph();
    
    // Extract nodes and edges from the data
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    
    // Helper function to determine node color based on type
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
    
    // Helper function to determine edge color based on type
    function getEdgeColor(channelType) {
        switch (channelType) {
            case 'Freeway': return '#E91E63';
            case 'Highway': return '#3F51B5';
            default: return '#9E9E9E';
        }
    }

    // Calculate min/max values for dynamic scaling
    const nodeChannels = nodes.map(node => node.Total_Channels || 0);
    const minChannels = Math.min(...nodeChannels.filter(c => c > 0)) || 1;
    const maxChannels = Math.max(...nodeChannels);
    
    const edgeCapacities = edges.map(edge => edge.capacity || 0);
    const minCapacity = Math.min(...edgeCapacities.filter(c => c > 0)) || 1;
    const maxCapacity = Math.max(...edgeCapacities);

    // Add nodes to the graph
    nodes.forEach(node => {
        // Set node color based on type if not already set
        if (!node.color) {
            node.color = getNodeColor(node.Node_Type);
        }
        
        graph.addNode(node.id, {
            x: node.x || Math.random() * 100,
            y: node.y || Math.random() * 100,
            size: calculateNodeSize(node.Total_Channels, minChannels, maxChannels),
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
    });

    // Add edges to the graph
    edges.forEach(edge => {
        try {
            // Set edge color based on type if not already set
            if (!edge.color) {
                edge.color = getEdgeColor(edge.Channel_Size_Tier);
            }
            
            graph.addEdge(edge.source, edge.target, {
                size: calculateEdgeWidth(edge.capacity, minCapacity, maxCapacity),
                color: edge.color,
                // Store all attributes for display
                attributes: {
                    id: edge.id,
                    channelSizeTier: edge.Channel_Size_Tier,
                    channelSizeRange: edge.Channel_Size_Range,
                    capacity: edge.capacity,
                    minCapacity: minCapacity,
                    maxCapacity: maxCapacity
                }
            });
        } catch (e) {
            console.error("Error adding edge:", e, edge);
        }
    });

    // Initialize sigma
    const container = document.getElementById('graph-container');
    const renderer = new Sigma(graph, container, {
        renderEdgeLabels: false,
        labelSize: 12,
        labelColor: {
            color: '#000'
        },
        nodeHoverColor: 'default',
        edgeHoverColor: 'default',
        defaultEdgeHoverColor: '#000',
        defaultNodeHoverColor: '#000',
        labelDensity: 0.07,
        labelGridCellSize: 60,
        labelRenderedSizeThreshold: 6,
        defaultEdgeType: "line",
        minEdgeSize: MIN_EDGE_WIDTH,
        maxEdgeSize: MAX_EDGE_WIDTH,
        reducers: {
            edgeReducer: (edge, data) => {
                if (!data || !edge) return null;
                const edgeData = graph.getEdgeAttributes(edge);
                if (!edgeData || !edgeData.attributes) return { ...data, hidden: true };
                
                const capacity = edgeData.attributes.capacity;
                const minCapacity = edgeData.attributes.minCapacity;
                const maxCapacity = edgeData.attributes.maxCapacity;
                const style = getEdgeStyle(capacity, minCapacity, maxCapacity);
                
                return {
                    ...data,
                    hidden: !shouldDisplayEdge(graph, edge, selectedNode),
                    type: style.type,
                    size: calculateEdgeWidth(capacity, minCapacity, maxCapacity)
                };
            }
        }
    });

    let selectedNode = null;

    // Update edge visibility when a node is selected
    renderer.on('clickNode', event => {
        selectedNode = selectedNode === event.node ? null : event.node;
        
        graph.forEachEdge(edge => {
            const edgeData = graph.getEdgeAttributes(edge);
            graph.setEdgeAttribute(edge, 'hidden', !shouldDisplayEdge(graph, edge, selectedNode));
        });
        
        renderer.refresh();
        // Node click to show details in sidebar
        const nodeId = event.node;
        const nodeAttributes = graph.getNodeAttributes(nodeId);
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
    });

    // Set up tooltips
    const tooltip = document.getElementById('tooltip');
    let hoveredNode = null;
    let hoveredEdge = null;

    // Node hover
    renderer.on('enterNode', event => {
        hoveredNode = event.node;
        const nodeAttributes = graph.getNodeAttributes(hoveredNode);
        const attrs = nodeAttributes.attributes;

        tooltip.innerHTML = `
            <div><strong>${nodeAttributes.label}</strong></div>
            <div>Type: ${attrs.nodeType || 'Unknown'}</div>
            <div>Capacity: ${attrs.totalCapacity}</div>
            <div>Channels: ${attrs.totalChannels}</div>
        `;

        tooltip.style.display = 'block';
        positionTooltip(event);
    });

    renderer.on('leaveNode', () => {
        hoveredNode = null;
        tooltip.style.display = 'none';
    });

    // Edge hover
    renderer.on('enterEdge', event => {
        hoveredEdge = event.edge;
        const edgeAttributes = graph.getEdgeAttributes(hoveredEdge);
        const attrs = edgeAttributes.attributes;

        const sourceNode = graph.getNodeAttributes(graph.source(hoveredEdge));
        const targetNode = graph.getNodeAttributes(graph.target(hoveredEdge));

        tooltip.innerHTML = `
            <div><strong>Channel</strong></div>
            <div>From: ${sourceNode.label}</div>
            <div>To: ${targetNode.label}</div>
            <div>Capacity: ${formatCapacity(attrs.capacity)}</div>
            <div>Type: ${attrs.channelSizeTier}</div>
        `;

        tooltip.style.display = 'block';
        positionTooltip(event);
    });

    renderer.on('leaveEdge', () => {
        hoveredEdge = null;
        tooltip.style.display = 'none';
    });

    // Mouse move to update tooltip position
    renderer.getMouseCaptor().on('mousemove', event => {
        if (hoveredNode || hoveredEdge) {
            positionTooltip(event);
        }
    });

    function positionTooltip(event) {
        const x = event.x + 5;
        const y = event.y + 5;
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }

    // Edge click to show details in sidebar
    renderer.on('clickEdge', event => {
        const edgeId = event.edge;
        const edgeAttributes = graph.getEdgeAttributes(edgeId);
        const attrs = edgeAttributes.attributes;

        const sourceId = graph.source(edgeId);
        const targetId = graph.target(edgeId);
        const sourceNode = graph.getNodeAttributes(sourceId);
        const targetNode = graph.getNodeAttributes(targetId);

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
    });

    // Search functionality
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', event => {
        const query = event.target.value.toLowerCase();

        if (query.length < 2) {
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

        // Show matching nodes and their connections
        const matchingNodes = new Set();
        graph.forEachNode(node => {
            const nodeAttributes = graph.getNodeAttributes(node);
            if (nodeAttributes.label.toLowerCase().includes(query)) {
                graph.setNodeAttribute(node, 'hidden', false);
                matchingNodes.add(node);

                // Show connected nodes and edges
                graph.forEachNeighbor(node, neighbor => {
                    graph.setNodeAttribute(neighbor, 'hidden', false);
                    matchingNodes.add(neighbor);
                });
            }
        });

        // Show edges between visible nodes
        graph.forEachEdge(edge => {
            const source = graph.source(edge);
            const target = graph.target(edge);
            if (matchingNodes.has(source) && matchingNodes.has(target)) {
                graph.setEdgeAttribute(edge, 'hidden', false);
            }
        });

        renderer.refresh();
    });

    // Zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => {
        const camera = renderer.getCamera();
        camera.animatedZoom({ duration: 200 });
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
        const camera = renderer.getCamera();
        camera.animatedUnzoom({ duration: 200 });
    });

    document.getElementById('reset-view').addEventListener('click', () => {
        const camera = renderer.getCamera();
        camera.animatedReset({ duration: 200 });
    });

    // Force Atlas 2 layout
    const forceAtlas2 = graphology.layouts && graphology.layouts.forceAtlas2 ? 
                       graphology.layouts.forceAtlas2 : 
                       window.forceAtlas2;
                       
    if (!forceAtlas2) {
        console.error('ForceAtlas2 layout not found');
        return;
    }

    const layout = {
        settings: {
            iterations: 50,
            gravity: 1,
            scalingRatio: 10,
            strongGravityMode: true,
            slowDown: 2
        },
        running: false
    };

    const toggleLayoutBtn = document.getElementById('toggle-layout');
    toggleLayoutBtn.addEventListener('click', () => {
        if (layout.running) {
            // Stop layout
            layout.running = false;
            toggleLayoutBtn.innerHTML = '<i class="fas fa-play"></i> Start Layout';
        } else {
            // Start layout
            layout.running = true;
            toggleLayoutBtn.innerHTML = '<i class="fas fa-pause"></i> Stop Layout';
            
            // Run ForceAtlas2
            forceAtlas2.assign(graph, layout.settings);
            
            // Auto-stop after 5 seconds to prevent overheating
            setTimeout(() => {
                if (layout.running) {
                    layout.running = false;
                    toggleLayoutBtn.innerHTML = '<i class="fas fa-play"></i> Start Layout';
                }
            }, 5000);
        }
    });

    // Update statistics
    document.getElementById('node-count').textContent = graph.order;
    document.getElementById('edge-count').textContent = graph.size;

    // Calculate total capacity
    let totalCapacity = 0;
    edges.forEach(edge => {
        totalCapacity += edge.capacity || 0;
    });
    document.getElementById('total-capacity').textContent = formatCapacity(totalCapacity);

    // Helper function to format capacity
    function formatCapacity(capacity) {
        if (!capacity) return '0 satoshis';
        
        if (capacity >= 100000000) {
            return (capacity / 100000000).toFixed(2) + ' BTC';
        } else if (capacity >= 100000) {
            return (capacity / 100000).toFixed(2) + ' mBTC';
        } else if (capacity >= 1000) {
            return (capacity / 1000).toFixed(2) + ' μBTC';
        } else {
            return capacity + ' satoshis';
        }
    }
}
# Lightning Network Graph Visualization

An interactive web-based visualization of the Lightning Network, developed by Bitcoin Data Labs. Explore Lightning Network nodes and channels through an intuitive, interactive interface with multiple dataset views and real-time statistics.

## Features

- **Interactive Graph Visualization**: Pan, zoom, and click on nodes/edges
- **Multiple Dataset Views**: Different channel types (All, Freeway, Highway)
- **Dynamic Layout**: Force-directed graph layout with user controls
- **Search Functionality**: Find nodes by name/alias
- **Detailed Information Panels**: Node and channel details in sidebar
- **Real-time Statistics**: Live node/edge counts and total capacity
- **Responsive Design**: Works on desktop and mobile devices

## Getting Started

### Prerequisites
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+)
- Local web server (for file loading security)

### Quick Setup
1. **Clone/Download the project**
2. **Start a local server**:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js (if you have http-server installed)
   npx http-server
   
   # VS Code Live Server extension
   # Right-click index.html → "Open with Live Server"
   ```
3. **Open browser** and navigate to `http://localhost:8000`
4. **Select a visualization** from the landing page

### How to Use the Graphs

1. **Dataset Selection**: On the landing page (`index.html`), choose from available datasets:
   - **All Channels** (`gall.json`): Complete network data (~2000+ nodes)
   - **Freeway Channels** (`gfree.json`): Freeway channels only
   - **Highway Channels** (`ghigh.json`): Highway channels only

2. **Navigation**:
   - **Pan**: Click and drag to move around the graph
   - **Zoom**: Use mouse wheel or zoom controls
   - **Search**: Type in the search box to find nodes by name/alias

3. **Interaction**:
   - **Hover**: See tooltips with node/edge information
   - **Click Nodes/Edges**: View detailed information in the sidebar
   - **Layout Controls**: Start/stop the force-directed layout algorithm

4. **Understanding the Visualization**:
   - **Node Colors**: Represent different node types (LSP: Green, Exchange: Blue, Wallet: Yellow, etc.)
   - **Node Size**: Based on number of channels (larger = more connections)
   - **Edge Colors**: Represent channel types (Freeway: Pink, Highway: Indigo, Default: Gray)
   - **Edge Width**: Based on channel capacity (thicker = higher capacity)

5. **Statistics**: View real-time network statistics in the top panel

For detailed technical information, see [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).

## Cite

If you find this visualization helpful in your research or work, please cite it as:

```
@misc{ln-graph-viz,
  author = {Saurabh Kumar and Bitcoin Data Labs},
  title = {Lightning Network Graph Visualization},
  year = {2025},
  publisher = {GitHub},
  url = {https://github.com/sorukumar/ln-graph-viz}
}
```

## License

This project is licensed under the BSD 3-Clause License - see the [LICENSE](LICENSE) file for details.

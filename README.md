# Lightning Network Graph Visualization

An interactive web-based visualization of the Lightning Network, updated daily,  developed by Bitcoin Data Labs. Explore Lightning Network nodes and channels through an intuitive, interactive interface with multiple dataset views and real-time statistics.

## Features

- **Interactive Graph Visualization**: Pan, zoom, and click on nodes/edges
- **Multiple Dataset Views**: Different channel types (All, Freeway, Highway)
- **Dynamic Layout**: Force-directed graph layout with user controls
- **Search Functionality**: Find nodes by name/alias
- **Detailed Information Panels**: Node and channel details in sidebar
- **Real-time Statistics**: Live node/edge counts and total capacity
- **Responsive Design**: Works on desktop and mobile devices

## How to Use the Graphs

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
   - **Node Colors**: Represent different clusters
   - **Node Size**: Based on number of channels (larger = more connections)
   - **Edge Width**: Based on channel capacity (thicker = higher capacity)

5. **Statistics**: View real-time network statistics in the top panel

## Tech Stack
   Python for stats calculation, Javascript, Sigma.js for graph visualization

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

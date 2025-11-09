## Lightning Network Graph JSON Attribute Mappings

This table documents the mapping from original attribute names to their shortened names in the exported JSON, for use in Sigma.js visualization and LLM reference.

### Node Attribute Mapping
| Original Name              | Short Name |
|----------------------------|------------|
| alias                      | alias      |
| cluster                    | c          |
| is_bridge_node             | br         |
| is_important_bridge_node   | ibr        |
| bridges_clusters           | bc         |
| cluster_connections        | cc         |
| pub_key                    | pk         |
| node_type                  | nt         |
| total_channels             | tch        |
| total_capacity             | tcap       |
| formatted_total_capacity   | fcap       |
| category_counts            | cat        |
| pleb_rank                  | pr         |
| capacity_rank              | cr         |
| channels_rank              | chr        |
| birth_tx                   | btx        |
| closed_channels_count      | clc        |

### Edge Attribute Mapping
| Original Name                | Short Name |
|------------------------------|------------|
| is_bridge_channel            | br         |
| is_important_bridge_channel  | ibr        |
| connects_clusters            | cc         |
| total_capacity               | cap        |
| channel_count                | cnt        |
| channels                     | chs        |

### Channel Object (inside `chs` array on edge)
| Original Name      | Short Name |
|--------------------|------------|
| tier               | t          |
| capacity           | cap        |
| birth_tx           | btx        |

---

Use this mapping to update your visualization code and documentation for the new compact JSON format.



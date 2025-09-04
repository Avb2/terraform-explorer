# Terraform Resource Explorer - Dependency & Impact Awareness

## Overview

The Terraform Resource Explorer Chrome extension now includes advanced dependency detection and impact analysis features that help you understand the relationships between your Terraform resources and the potential impact of changes.

## Features

### 1. Automatic Dependency Detection

The extension automatically detects two types of dependencies:

#### Explicit Dependencies (`depends_on`)
- Parses `depends_on` attributes in resource and module blocks
- Supports both single and list formats
- Examples:
  ```hcl
  depends_on = [aws_subnet.public, aws_security_group.web]
  depends_on = aws_vpc.main
  ```

#### Implicit Dependencies (References)
- Detects when resources reference other resources through attributes
- Supports various Terraform reference patterns:
  - Resource references: `aws_instance.web.id`
  - Module outputs: `module.vpc.vpc_id`
  - Data source references: `data.aws_ami.ubuntu.id`
  - Variable references: `var.environment`
  - Local references: `local.common_tags`

### 2. Visual Dependency Graph

The graph visualization now shows:

- **Solid Orange Lines**: Explicit dependencies (`depends_on`)
- **Dashed Purple Lines**: Implicit dependencies (references)
- **Solid Purple Lines**: User-drawn relationships

### 3. Impact Analysis

When you click on a resource in the graph, the extension shows:

#### Direct Dependencies
- Resources that the selected resource depends on
- Type of dependency (explicit/implicit)

#### Dependents
- Resources that depend on the selected resource
- Type of dependency relationship

#### Impact Chain
- All resources that would be affected if the selected resource is destroyed
- Cascade effect analysis showing the full chain of dependencies

### 4. Visual Impact Highlighting

When a resource is selected:
- **Blue**: Selected resource
- **Red**: Resources that would be affected if destroyed
- **Highlighted Edges**: Direct connections to impacted resources

## How It Works

### 1. HCL Parsing

The enhanced parser:
- Tracks block depth and structure
- Extracts `depends_on` attributes
- Uses regex patterns to detect resource references
- Builds a complete dependency map

### 2. Dependency Analysis

The system:
- Creates an adjacency list from detected dependencies
- Uses Depth-First Search (DFS) to calculate impact chains
- Builds a lookup map for quick impact analysis

### 3. Graph Visualization

Cytoscape.js handles:
- Different edge styles for different dependency types
- Node highlighting for impact analysis
- Interactive selection and highlighting

## Usage Examples

### Example 1: VPC Dependencies

```hcl
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id  # Implicit dependency
  cidr_block = "10.0.1.0/24"
}

resource "aws_instance" "web" {
  ami           = "ami-123456"
  instance_type = "t3.micro"
  subnet_id     = aws_subnet.public.id  # Implicit dependency
  
  depends_on = [aws_subnet.public]  # Explicit dependency
}
```

**Result**: Clicking on `aws_vpc.main` shows that `aws_subnet.public` and `aws_instance.web` would be affected if the VPC is destroyed.

### Example 2: Security Group Dependencies

```hcl
resource "aws_security_group" "web" {
  name = "web-sg"
  vpc_id = aws_vpc.main.id
}

resource "aws_security_group" "database" {
  name = "database-sg"
  vpc_id = aws_vpc.main.id
  
  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]  # Implicit dependency
  }
}
```

**Result**: The database security group depends on the web security group, creating a dependency chain.

## Controls

### Graph Controls
- **Zoom In/Out**: Adjust graph zoom level
- **Reset View**: Return to default view
- **Pan Mode**: Toggle panning functionality
- **Draw Mode**: Manually create relationships
- **Clear**: Remove all drawn relationships
- **Reset**: Clear impact highlighting

### Legend
The legend shows:
- Resource types (green rectangles)
- Module types (orange diamonds)
- Dependency types (solid/dashed lines)

## Technical Implementation

### Key Functions

1. **`parseHCL(content)`**: Enhanced parser with dependency detection
2. **`buildDependencyGraph(resources, modules)`**: Creates graph with dependency edges
3. **`buildImpactMap(elements, impactMap)`**: Calculates impact chains
4. **`showImpactAnalysis(node, dependencyData)`**: Displays impact analysis
5. **`highlightImpactChain(selectedNodeId, impactedResources, cy)`**: Visual highlighting

### Data Structures

- **`dependencyMap`**: Maps resource IDs to resource objects
- **`impactMap`**: Maps resource IDs to arrays of impacted resources
- **`elements`**: Cytoscape.js graph elements

### Edge Types

- **`explicit`**: `depends_on` relationships
- **`implicit`**: Reference-based dependencies
- **`user-drawn`**: Manually created relationships

## Benefits

1. **Risk Assessment**: Understand the impact of destroying resources
2. **Planning**: Plan changes with full dependency awareness
3. **Documentation**: Visual representation of infrastructure relationships
4. **Troubleshooting**: Identify dependency issues quickly
5. **Compliance**: Ensure proper dependency management

## Limitations

1. **HCL Parsing**: Limited to basic HCL syntax (not full Terraform parser)
2. **Complex References**: May miss some complex variable or function references
3. **External Dependencies**: Doesn't track dependencies outside the current file
4. **Dynamic References**: Limited support for dynamic blocks and for_each

## Future Enhancements

1. **Multi-file Analysis**: Support for multiple .tf files
2. **Advanced Parsing**: Full Terraform HCL parser integration
3. **Dependency Metrics**: Calculate dependency complexity scores
4. **Change Impact**: Show impact of specific attribute changes
5. **Export Features**: Export dependency graphs to various formats

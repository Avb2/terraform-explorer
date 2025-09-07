// globals.js
// Global variables and constants for Terraform Resource Explorer

let cy = null;
let sidebarEl = null;
let viewportSaveTimer = null;

console.log('globals.js: Globals loaded');

// --------- Globals ----------
// Global variable to store AWS documentation URLs (using pattern-based fallback)
let awsDocUrls = {};

// Function to generate provider documentation URLs
function getProviderDocUrl(resourceType) {
  // Check if we have an exact match in our loaded AWS URLs
  if (awsDocUrls[resourceType]) {
    return awsDocUrls[resourceType];
  }

  // Handle AWS resources with pattern matching as fallback
  if (resourceType.startsWith('aws_')) {
    const resourceName = resourceType.replace('aws_', '');
    return 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/' + resourceName;
  }

  // Handle Azure resources
  if (resourceType.startsWith('azurerm_')) {
    const resourceName = resourceType.replace('azurerm_', '');
    return 'https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/' + resourceName;
  }

  // Handle Google Cloud resources
  if (resourceType.startsWith('google_')) {
    const resourceName = resourceType.replace('google_', '');
    return 'https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/' + resourceName;
  }

  // Handle Kubernetes resources
  if (resourceType.startsWith('kubernetes_')) {
    const resourceName = resourceType.replace('kubernetes_', '');
    return 'https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/' + resourceName;
  }

  // Handle other providers with predictable patterns
  const providerPatterns = [
    { prefix: 'vsphere_', provider: 'vsphere' },
    { prefix: 'vault_', provider: 'vault' },
    { prefix: 'consul_', provider: 'consul' },
    { prefix: 'nomad_', provider: 'nomad' },
    { prefix: 'docker_', provider: 'docker' },
    { prefix: 'helm_', provider: 'helm' },
    { prefix: 'mysql_', provider: 'mysql' },
    { prefix: 'postgresql_', provider: 'postgresql' },
    { prefix: 'mongodb_', provider: 'mongodb' },
    { prefix: 'redis_', provider: 'redis' }
  ];

  for (const pattern of providerPatterns) {
    if (resourceType.startsWith(pattern.prefix)) {
      const resourceName = resourceType.replace(pattern.prefix, '');
      return 'https://registry.terraform.io/providers/hashicorp/' + pattern.provider + '/latest/docs/resources/' + resourceName;
    }
  }

  // Fallback to general registry search
  return 'https://registry.terraform.io/search?q=' + encodeURIComponent(resourceType);
}

const providerDocs = {
  aws_instance: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance',
  aws_s3_bucket: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket',
  aws_s3_bucket_acl: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_acl',
  aws_s3_bucket_policy: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy',
  aws_s3_object: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_object'
};

const requiredAttributes = {
  aws_instance: ['ami', 'instance_type'],
  aws_s3_bucket: ['bucket'],
  aws_s3_bucket_acl: ['bucket', 'acl'],
  aws_s3_bucket_policy: ['bucket', 'policy'],
  aws_s3_object: ['bucket', 'key']
};

let debounceTimer = null;
let cytoscapeReady = false;
let graphUpdateTimer = null;
let lastContentHash = null;

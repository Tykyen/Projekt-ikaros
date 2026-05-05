import * as fs from 'fs';
import * as path from 'path';

export interface OldEndpoint {
  verb: string;
  path: string;
  controller: string;
}

export interface OldHubMethod {
  hub: string;
  name: string;
  direction: 'client-to-server' | 'server-to-client';
}

export interface OldSchema {
  name: string;
  collectionName: string;
}

export interface OldCronJob {
  name: string;
  file: string;
}

export interface OldJwtClaim {
  name: string;
}

export interface OldBackendData {
  endpoints: OldEndpoint[];
  hubMethods: OldHubMethod[];
  schemas: OldSchema[];
  cronJobs: OldCronJob[];
  jwtClaims: OldJwtClaim[];
}

function parseControllerFile(content: string): OldEndpoint[] {
  const endpoints: OldEndpoint[] = [];

  const classMatch = content.match(/public class (\w+)Controller\s*:/);
  if (!classMatch) return endpoints;
  const controllerSlug = classMatch[1];
  const controllerName = controllerSlug.toLowerCase();

  const routeMatch = content.match(/\[Route\("([^"]+)"\)\]/);
  let basePath = routeMatch ? routeMatch[1] : `api/${controllerName}`;
  basePath = basePath
    .replace('[controller]', controllerName)
    .replace('[Controller]', controllerName);
  if (!basePath.startsWith('/')) basePath = '/' + basePath;

  const httpPattern = /\[(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch)(?:\("([^"]*)"\))?\]/g;
  let match;
  while ((match = httpPattern.exec(content)) !== null) {
    const verb = match[1].replace('Http', '').toUpperCase();
    const subPath = match[2] ?? '';
    const fullPath = subPath
      ? `${basePath}/${subPath}`.replace(/\/+/g, '/')
      : basePath;
    endpoints.push({ verb, path: fullPath, controller: controllerSlug });
  }

  return endpoints;
}

function parseHubFile(content: string, fileName: string): OldHubMethod[] {
  const methods: OldHubMethod[] = [];
  if (!/ Hub/.test(content) && !content.includes(': Hub')) return methods;

  const hubNameMatch = content.match(/public class (\w+)\s*:/);
  const hubName = hubNameMatch?.[1] ?? path.basename(fileName, '.cs');

  const methodPattern = /public async Task (\w+)\s*\(/g;
  let match;
  while ((match = methodPattern.exec(content)) !== null) {
    methods.push({ hub: hubName, name: match[1], direction: 'client-to-server' });
  }

  const sendPattern = /\.SendAsync\("([^"]+)"/g;
  while ((match = sendPattern.exec(content)) !== null) {
    methods.push({ hub: hubName, name: match[1], direction: 'server-to-client' });
  }

  return methods;
}

function parseModelFiles(backendDir: string): OldSchema[] {
  const schemas: OldSchema[] = [];
  const settingsPath = path.join(backendDir, 'Models', 'MongoDBSettings.cs');

  if (fs.existsSync(settingsPath)) {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const propPattern = /public string (\w+CollectionName)\s*\{[^}]+\}\s*=\s*"([^"]+)"/g;
    let match;
    while ((match = propPattern.exec(content)) !== null) {
      const name = match[1].replace('CollectionName', '');
      schemas.push({ name, collectionName: match[2] });
    }
  }

  if (schemas.length === 0) {
    const modelsDir = path.join(backendDir, 'Models');
    if (!fs.existsSync(modelsDir)) return schemas;
    const skip = new Set(['Dto', 'Settings', 'Status', 'Result', 'Info', 'Model', 'LoginModel', 'WorldPage', 'CustomDiaryBlock', 'DirectoryItemDto']);
    for (const file of fs.readdirSync(modelsDir).filter(f => f.endsWith('.cs'))) {
      const name = file.replace('.cs', '');
      if (!skip.has(name) && !name.endsWith('Dto') && !name.endsWith('Settings')) {
        schemas.push({ name, collectionName: name + 's' });
      }
    }
  }

  return schemas;
}

function parseJwtClaims(content: string): OldJwtClaim[] {
  const seen = new Set<string>();
  const pattern = /new Claim\(\s*([^,)]+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    let claimType = match[1].trim().replace(/^["']|["']$/g, '');
    claimType = claimType
      .replace('ClaimTypes.NameIdentifier', 'sub')
      .replace('ClaimTypes.Name', 'unique_name')
      .replace('ClaimTypes.Role', 'role')
      .replace('JwtRegisteredClaimNames.Sub', 'sub')
      .replace(/JwtRegisteredClaimNames\.(\w+)/, (_, n: string) => n.toLowerCase());
    seen.add(claimType);
  }
  return [...seen].map(name => ({ name }));
}

function parseBackgroundJobs(backendDir: string): OldCronJob[] {
  const jobs: OldCronJob[] = [];
  const servicesDir = path.join(backendDir, 'Services');
  if (!fs.existsSync(servicesDir)) return jobs;

  for (const file of fs.readdirSync(servicesDir).filter(f => f.endsWith('.cs'))) {
    const content = fs.readFileSync(path.join(servicesDir, file), 'utf-8');
    if (content.includes('IHostedService') || content.includes('BackgroundService')) {
      jobs.push({ name: file.replace('.cs', ''), file });
    }
  }
  return jobs;
}

export function parseCsharpBackend(backendDir: string): OldBackendData {
  const controllersDir = path.join(backendDir, 'Controllers');
  const hubsDir = path.join(backendDir, 'Hubs');

  const endpoints: OldEndpoint[] = [];
  const hubMethods: OldHubMethod[] = [];

  for (const file of (fs.existsSync(controllersDir) ? fs.readdirSync(controllersDir) : []).filter(f => f.endsWith('.cs'))) {
    const content = fs.readFileSync(path.join(controllersDir, file), 'utf-8');
    endpoints.push(...parseControllerFile(content));
  }

  for (const file of (fs.existsSync(hubsDir) ? fs.readdirSync(hubsDir) : []).filter(f => f.endsWith('.cs'))) {
    const content = fs.readFileSync(path.join(hubsDir, file), 'utf-8');
    hubMethods.push(...parseHubFile(content, file));
  }

  const schemas = parseModelFiles(backendDir);

  const authPath = path.join(backendDir, 'Controllers', 'AuthController.cs');
  const jwtClaims = fs.existsSync(authPath)
    ? parseJwtClaims(fs.readFileSync(authPath, 'utf-8'))
    : [];

  const cronJobs = parseBackgroundJobs(backendDir);

  return { endpoints, hubMethods, schemas, cronJobs, jwtClaims };
}

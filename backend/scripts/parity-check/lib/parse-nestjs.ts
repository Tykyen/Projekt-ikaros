import { Project } from 'ts-morph';
import * as path from 'path';

export interface NewEndpoint {
  verb: string;
  path: string;
  controller: string;
}

export interface NewGatewayMessage {
  gateway: string;
  event: string;
  direction: 'client-to-server' | 'server-to-client';
}

export interface NewSchema {
  name: string;
}

export interface NewCronJob {
  schedule: string;
  method: string;
  className: string;
}

export interface NewJwtClaim {
  name: string;
}

export interface NewBackendData {
  endpoints: NewEndpoint[];
  gatewayMessages: NewGatewayMessage[];
  schemas: NewSchema[];
  cronJobs: NewCronJob[];
  jwtClaims: NewJwtClaim[];
}

function getFirstStringArg(decorator: import('ts-morph').Decorator): string {
  const args = decorator.getArguments();
  if (args.length === 0) return '';
  return args[0].getText().replace(/^['"`]|['"`]$/g, '');
}

export function parseNestjsBackend(srcDir: string): NewBackendData {
  const project = new Project({
    compilerOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    skipAddingFilesFromTsConfig: true,
  });

  project.addSourceFilesAtPaths([
    path.join(srcDir, '**/*.controller.ts').replace(/\\/g, '/'),
    path.join(srcDir, '**/*.gateway.ts').replace(/\\/g, '/'),
    path.join(srcDir, '**/*.schema.ts').replace(/\\/g, '/'),
    path.join(srcDir, '**/auth.service.ts').replace(/\\/g, '/'),
    path.join(srcDir, '**/jwt.strategy.ts').replace(/\\/g, '/'),
  ]);

  const endpoints: NewEndpoint[] = [];
  const gatewayMessages: NewGatewayMessage[] = [];
  const schemas: NewSchema[] = [];
  const cronJobs: NewCronJob[] = [];
  const jwtClaims: NewJwtClaim[] = [];
  const HTTP_VERBS = ['Get', 'Post', 'Put', 'Delete', 'Patch'] as const;

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      // REST kontrolery
      const controllerDec = cls.getDecorator('Controller');
      if (controllerDec) {
        const baseSeg = getFirstStringArg(controllerDec);
        const basePath = baseSeg ? `/api/${baseSeg}` : '/api';
        const controllerName = cls.getName() ?? sourceFile.getBaseName();

        for (const method of cls.getMethods()) {
          for (const verb of HTTP_VERBS) {
            const dec = method.getDecorator(verb);
            if (dec) {
              const subSeg = getFirstStringArg(dec);
              const fullPath = subSeg
                ? `${basePath}/${subSeg}`.replace(/\/+/g, '/')
                : basePath;
              endpoints.push({
                verb: verb.toUpperCase(),
                path: fullPath,
                controller: controllerName,
              });
            }
          }
        }
      }

      // WebSocket gateway
      const gatewayDec = cls.getDecorator('WebSocketGateway');
      if (gatewayDec) {
        const gatewayName = cls.getName() ?? sourceFile.getBaseName();
        for (const method of cls.getMethods()) {
          const subDec = method.getDecorator('SubscribeMessage');
          if (subDec) {
            gatewayMessages.push({
              gateway: gatewayName,
              event: getFirstStringArg(subDec),
              direction: 'client-to-server',
            });
          }
          // Server→klient eventy z těla metody
          const body = method.getBody()?.getText() ?? '';
          const emitPattern = /\.emit\(['"`]([^'"`]+)['"`]/g;
          let match;
          while ((match = emitPattern.exec(body)) !== null) {
            gatewayMessages.push({
              gateway: gatewayName,
              event: match[1],
              direction: 'server-to-client',
            });
          }
        }
      }

      // MongoDB schémata
      if (cls.getDecorator('Schema')) {
        schemas.push({ name: cls.getName() ?? 'Unknown' });
      }

      // Cron joby
      for (const method of cls.getMethods()) {
        const cronDec = method.getDecorator('Cron');
        if (cronDec) {
          cronJobs.push({
            schedule: getFirstStringArg(cronDec),
            method: method.getName(),
            className: cls.getName() ?? '',
          });
        }
      }
    }

    // JWT claims z auth service / jwt strategy
    const fileName = sourceFile.getBaseName();
    if (fileName.includes('auth') || fileName.includes('jwt')) {
      const text = sourceFile.getText();
      const payloadMatch = text.match(/sign\(\s*\{([^}]+)\}/s);
      if (payloadMatch) {
        const keyPattern = /(\w+)\s*:/g;
        let match;
        const reserved = new Set([
          'const',
          'let',
          'var',
          'return',
          'if',
          'else',
        ]);
        while ((match = keyPattern.exec(payloadMatch[1])) !== null) {
          if (!reserved.has(match[1])) {
            jwtClaims.push({ name: match[1] });
          }
        }
      }
    }
  }

  // Deduplicate server-to-client events
  const uniqueGateway = gatewayMessages.filter(
    (m, i, arr) =>
      arr.findIndex(
        (x) =>
          x.gateway === m.gateway &&
          x.event === m.event &&
          x.direction === m.direction,
      ) === i,
  );

  return {
    endpoints,
    gatewayMessages: uniqueGateway,
    schemas,
    cronJobs,
    jwtClaims,
  };
}

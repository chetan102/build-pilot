export interface McpServerRequest {
  jsonrpc?: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpServerResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface BuildPilotDataProvider {
  listTasks?(filter: { status?: string }, pagination: { page: number; limit: number }): Promise<{ tasks: any[]; total: number }>;
  getTaskDetails?(taskId: string): Promise<any>;
  listEvents?(taskId: string): Promise<any[]>;
}

export class BuildPilotMcpServer {
  private dataProvider?: BuildPilotDataProvider;

  constructor(dataProvider?: BuildPilotDataProvider) {
    this.dataProvider = dataProvider;
  }

  setDataProvider(provider: BuildPilotDataProvider): void {
    this.dataProvider = provider;
  }

  async handleRequest(req: McpServerRequest): Promise<McpServerResponse> {
    const id = req.id ?? 1;

    switch (req.method) {
      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'buildpilot_list_tasks',
                description: 'List engineering tasks with status and project filters',
                inputSchema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', description: 'Filter by task status' },
                    limit: { type: 'number', description: 'Number of items to return' },
                  },
                },
              },
              {
                name: 'buildpilot_get_task',
                description: 'Get task details, runs, and timeline steps by taskId',
                inputSchema: {
                  type: 'object',
                  properties: {
                    taskId: { type: 'string', description: 'The task ID' },
                  },
                  required: ['taskId'],
                },
              },
              {
                name: 'buildpilot_get_events',
                description: 'Get execution events and logs for a task',
                inputSchema: {
                  type: 'object',
                  properties: {
                    taskId: { type: 'string', description: 'The task ID' },
                  },
                  required: ['taskId'],
                },
              },
            ],
          },
        };
      }

      case 'tools/call': {
        const toolName = req.params?.name;
        const args = (req.params?.arguments as Record<string, any>) || {};

        if (toolName === 'buildpilot_list_tasks') {
          if (this.dataProvider?.listTasks) {
            const listRes = await this.dataProvider.listTasks(
              { status: args.status },
              { page: 1, limit: args.limit || 20 },
            );
            return {
              jsonrpc: '2.0',
              id,
              result: listRes,
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: { tasks: [], total: 0 },
          };
        }

        if (toolName === 'buildpilot_get_task') {
          if (this.dataProvider?.getTaskDetails) {
            const details = await this.dataProvider.getTaskDetails(args.taskId);
            return {
              jsonrpc: '2.0',
              id,
              result: details || { error: 'Task not found' },
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: { taskId: args.taskId, status: 'UNKNOWN' },
          };
        }

        if (toolName === 'buildpilot_get_events') {
          if (this.dataProvider?.listEvents) {
            const events = await this.dataProvider.listEvents(args.taskId);
            return {
              jsonrpc: '2.0',
              id,
              result: { events },
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: { events: [] },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method '${toolName}' not found`,
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Unknown RPC method '${req.method}'`,
          },
        };
    }
  }
}

export const buildPilotMcpServer = new BuildPilotMcpServer();

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type WorkflowNode = {
  id: string;
  name: string;
  type: string;
  onError?: string;
  parameters?: Record<string, unknown>;
};

type Workflow = {
  active: boolean;
  name: string;
  nodes: WorkflowNode[];
  connections: Record<
    string,
    {
      main?: Array<
        Array<{
          node: string;
          type: string;
          index: number;
        }>
      >;
    }
  >;
};

const workflowPath = new URL(
  "../../n8n/workflows/03-conversation-router-v2.json",
  import.meta.url,
);
const rawWorkflow = readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(rawWorkflow) as Workflow;
const nodeNames = new Set(workflow.nodes.map((node) => node.name));
const nodesByName = new Map(
  workflow.nodes.map((node) => [node.name, node]),
);

type CodeNodeResult = Array<{
  json: Record<string, unknown>;
}>;

async function runCodeNode(
  nodeName: string,
  nodeData: Record<string, Record<string, unknown>>,
  inputData: Record<string, unknown> = {},
) {
  const code = nodesByName.get(nodeName)?.parameters?.jsCode;
  assert.equal(typeof code, "string");
  if (typeof code !== "string") {
    throw new Error(`Code node not found: ${nodeName}`);
  }

  const AsyncFunction = Object.getPrototypeOf(
    async function noop() {},
  ).constructor as new (
    ...parameters: string[]
  ) => (
    dollar: (name: string) => { first: () => { json: Record<string, unknown> } },
    input: { first: () => { json: Record<string, unknown> } },
    current: Record<string, unknown>,
  ) => Promise<CodeNodeResult>;
  const execute = new AsyncFunction("$", "$input", "$json", code);

  return execute(
    (name) => ({
      first: () => ({ json: nodeData[name] ?? {} }),
    }),
    { first: () => ({ json: inputData }) },
    inputData,
  );
}

test("Router V2 n8n export stays inactive and starts as a sub-workflow", () => {
  assert.equal(workflow.active, false);
  assert.match(workflow.name, /STAGING/);
  assert.equal(
    workflow.nodes[0]?.type,
    "n8n-nodes-base.executeWorkflowTrigger",
  );
});

test("Router V2 n8n graph only points to existing unique nodes", () => {
  assert.equal(nodeNames.size, workflow.nodes.length);
  assert.equal(
    new Set(workflow.nodes.map((node) => node.id)).size,
    workflow.nodes.length,
  );

  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.ok(nodeNames.has(source), `unknown connection source: ${source}`);

    for (const output of outputs.main ?? []) {
      for (const connection of output) {
        assert.ok(
          nodeNames.has(connection.node),
          `unknown connection target: ${connection.node}`,
        );
        assert.equal(connection.type, "main");
        assert.equal(connection.index, 0);
      }
    }
  }

  const reachable = new Set<string>();
  const pending = [workflow.nodes[0]?.name];
  while (pending.length > 0) {
    const name = pending.shift();
    if (!name || reachable.has(name)) continue;
    reachable.add(name);

    for (const output of workflow.connections[name]?.main ?? []) {
      for (const connection of output) {
        pending.push(connection.node);
      }
    }
  }

  assert.equal(reachable.size, workflow.nodes.length);
});

test("Router V2 n8n export includes batching, human guard, media, and ordered outbound", () => {
  for (const requiredNode of [
    "Wait for Message Fragments",
    "Batch Messages",
    "Stop Superseded Execution",
    "Load Sales State",
    "Automation Initially Allowed",
    "Audio URL Is Trusted Meta",
    "Transcribe Audio",
    "Image URL Is Trusted Meta",
    "Analyze Product Image",
    "Recheck Latest Message",
    "Latest Message Still Ready",
    "Automation Is Allowed",
    "Stop - Human Owns Conversation",
    "Mark Human Handoff",
    "Optional AI Draft",
    "Recheck Automation Ownership",
    "Automation Still Allowed",
    "Prepare Ordered Outbound",
    "Dispatch via Outbound V2",
  ]) {
    assert.ok(nodeNames.has(requiredNode), `missing node: ${requiredNode}`);
  }

  assert.match(rawWorkflow, /router:\$\{normalized\.triggerMessageId\}:\$\{index \+ 1\}/);
  assert.match(rawWorkflow, /"batchSize": 1/);
  assert.match(rawWorkflow, /"retryOnFail": true/);
  assert.match(rawWorkflow, /AWAITING_PAYMENT_CONFIRMATION/);
  assert.match(rawWorkflow, /function splitWhatsappText/);
  assert.match(rawWorkflow, /source\.duplicate === true/);
  assert.equal(
    workflow.connections["Latest Message Still Ready"]?.main?.[1]?.[0]?.node,
    "Stop Superseded Execution",
  );
  assert.equal(
    workflow.connections["Automation Initially Allowed"]?.main?.[1]?.[0]?.node,
    "Stop - Human Owns Conversation",
  );
  assert.equal(
    workflow.connections["Automation Still Allowed"]?.main?.[1]?.[0]?.node,
    "Stop - Human Owns Conversation",
  );
});

test("Router V2 media failures follow a safe branch", () => {
  assert.equal(
    workflow.connections["Audio URL Is Trusted Meta"]?.main?.[1]?.[0]?.node,
    "Handoff Audio Failure",
  );
  assert.equal(
    workflow.connections["Image URL Is Trusted Meta"]?.main?.[1]?.[0]?.node,
    "Build Router Payload",
  );

  for (const nodeName of [
    "Use Audio Data URL",
    "Download Audio",
    "Audio to Data URL",
    "Transcribe Audio",
  ]) {
    assert.equal(nodesByName.get(nodeName)?.onError, "continueErrorOutput");
    assert.equal(
      workflow.connections[nodeName]?.main?.[1]?.[0]?.node,
      "Handoff Audio Failure",
    );
  }

  for (const nodeName of [
    "Use Image Data URL",
    "Download Image",
    "Image to Data URL",
  ]) {
    assert.equal(nodesByName.get(nodeName)?.onError, "continueErrorOutput");
    assert.equal(
      workflow.connections[nodeName]?.main?.[1]?.[0]?.node,
      "Build Router Payload",
    );
  }

  assert.match(rawWorkflow, /host\.endsWith\('\.facebook\.com'\)/);
  assert.match(rawWorkflow, /host\.endsWith\('\.fbsbx\.com'\)/);

  for (const nodeName of ["Download Audio", "Download Image"]) {
    const options = nodesByName.get(nodeName)?.parameters?.options as
      | {
          redirect?: {
            redirect?: { followRedirects?: boolean };
          };
        }
      | undefined;
    assert.equal(options?.redirect?.redirect?.followRedirects, false);
  }
});

test("Router V2 discards duplicate inbound executions", async () => {
  const result = await runCodeNode(
    "Normalize Router Input",
    {},
    { duplicate: true },
  );

  assert.deepEqual(result, []);
});

test("Router V2 only marks Meta HTTPS media URLs as credential-safe", async () => {
  const result = await runCodeNode(
    "Prepare Media Context",
    {
      "Batch Messages": {
        batch: {
          content: "media",
          media: [
            {
              messageType: "AUDIO",
              mediaUrl: "https://attacker.example/audio.ogg",
            },
            {
              messageType: "IMAGE",
              mediaUrl: "https://lookaside.fbsbx.com/product.jpg",
            },
          ],
        },
      },
      "Normalize Router Input": {
        conversationId: "conversation-1",
        triggerMessageId: "message-1",
      },
    },
    { salesState: null },
  );

  assert.equal(result[0]?.json.audioRemoteTrusted, false);
  assert.equal(result[0]?.json.imageRemoteTrusted, true);
});

test("Router V2 prepares long drafted text once and keeps stable ordering", async () => {
  const result = await runCodeNode("Prepare Ordered Outbound", {
    "Normalize Router Input": { triggerMessageId: "message-123456" },
    "Optional AI Draft": { text: "a".repeat(4500) },
    "Route Message V2": {
      conversation: {
        id: "conversation-1",
        recipient: "51999999999",
      },
      draftText: "original",
      outboundMessages: [
        {
          type: "IMAGE",
          imageUrl: "https://cdn.example.test/product.jpg",
          caption: "Producto",
        },
        { type: "TEXT", text: "old chunk 1" },
        { type: "TEXT", text: "old chunk 2" },
      ],
    },
  });

  assert.equal(result.length, 3);
  assert.equal(result[0]?.json.type, "IMAGE");
  assert.equal(result[1]?.json.type, "TEXT");
  assert.equal(String(result[1]?.json.content).length, 4000);
  assert.equal(String(result[2]?.json.content).length, 500);
  assert.deepEqual(
    result.map((item) => item.json.requestId),
    [
      "router:message-123456:1",
      "router:message-123456:2",
      "router:message-123456:3",
    ],
  );
});

test("Router V2 n8n export contains placeholders but no embedded secrets", () => {
  assert.match(rawWorkflow, /Router V2 Internal API/);
  assert.match(rawWorkflow, /Meta WhatsApp Bearer/);
  assert.match(rawWorkflow, /Outbound V2 Internal API/);
  assert.match(rawWorkflow, /ROUTER_V2_BACKEND_BASE_URL/);
  assert.match(rawWorkflow, /ROUTER_V2_OUTBOUND_WEBHOOK_URL/);
  assert.doesNotMatch(rawWorkflow, /https:\/\/tiendavirtualsuper\.com/);
  assert.doesNotMatch(rawWorkflow, /Bearer\s+[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(rawWorkflow, /EA[A-Za-z0-9]{30,}/);
});

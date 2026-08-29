import { getConversations } from "./src/lib/messages-service";

async function main() {
  try {
    const res = await getConversations({ page: 1, limit: 10 });
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error(e);
  }
}

main();

import { PrismaClient, Channel, ConversationState, MessageDirection, MessageSender, MessageType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Start seeding chat data...')

  // 1. Create a ChatContact
  const contact = await prisma.chatContact.create({
    data: {
      name: "Juan Pérez (Test)",
      phone: "+51 987 654 321",
      tags: ["Test", "Cliente frecuente"],
    }
  })
  console.log(`Created contact with id: ${contact.id}`)

  // 2. Create a Conversation
  const conversation = await prisma.conversation.create({
    data: {
      contactId: contact.id,
      channel: Channel.WHATSAPP,
      status: ConversationState.AUTOMATICO,
      botEnabled: true,
      unreadCount: 1,
    }
  })
  console.log(`Created conversation with id: ${conversation.id}`)

  // 3. Create Messages
  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      senderType: MessageSender.CUSTOMER,
      messageType: MessageType.TEXT,
      content: "Hola",
      status: "delivered",
      createdAt: new Date(Date.now() - 1000 * 60 * 10) // 10 mins ago
    }
  })

  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.OUTBOUND,
      senderType: MessageSender.BOT,
      messageType: MessageType.TEXT,
      content: "¡Hola! Bienvenido a Importadora Super. ¿En qué podemos ayudarte hoy?",
      status: "read",
      createdAt: new Date(Date.now() - 1000 * 60 * 9)
    }
  })

  const lastMsg = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      senderType: MessageSender.CUSTOMER,
      messageType: MessageType.TEXT,
      content: "¿Tienen O702 negro?",
      status: "delivered",
      createdAt: new Date(Date.now() - 1000 * 60 * 5)
    }
  })
  
  // Update lastMessageAt
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: lastMsg.createdAt }
  })

  console.log('Seeding chat data finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

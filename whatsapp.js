import axios from "axios"

export async function sendMessage(chatId, text) {

  const url = `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.GREEN_TOKEN}`

  await axios.post(url, {
    chatId: chatId,
    message: text
  })

}

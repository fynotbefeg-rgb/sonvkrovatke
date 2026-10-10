// Transport-independent core: invoke ONLY after authenticating Telegram transport.
// No bot network requests and no ability to approve a script on Roman's behalf.
export async function handleVerifiedStart(update, {queue, allowedOperatorIds, readCurrentApprovals, provider = 'manual_upload'}) {
  if (!Array.isArray(allowedOperatorIds) || !allowedOperatorIds.length ||
      allowedOperatorIds.some(id => typeof id !== 'string' || !/^[1-9][0-9]{0,15}$/.test(id))) {
    throw Error('Configure authorized Telegram operator IDs');
  }
  const callback = update?.callback_query;
  const sender = callback?.from?.id;
  const chat = callback?.message?.chat;
  if (!Number.isSafeInteger(sender) || sender <= 0 || !allowedOperatorIds.includes(String(sender)) ||
      chat?.type !== 'private' || chat.id !== sender) throw Error('Unauthorized Telegram operator or chat');
  if (typeof callback.data !== 'string' || !/^start:[a-f0-9-]{36}$/.test(callback.data)) throw Error('Unsupported callback');
  if (typeof callback.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(callback.id)) throw Error('Invalid callback ID');
  if (typeof readCurrentApprovals !== 'function') throw Error('Authenticated approval reader required');
  // Ignore any client-supplied approval/provider fields in the update.
  const current = await readCurrentApprovals();
  return queue.startTicket(callback.data.slice(6), callback.id, String(sender), current, {provider});
}

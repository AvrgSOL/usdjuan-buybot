const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');

const BOT_TOKEN   = process.env.BOT_TOKEN   || '8968795934:AAGnr5BgtJBp2MLJTcTUQEPQBjGqWu0nb2Y';
const CHAT_ID     = process.env.CHAT_ID     || '-1004295898320';
const TOKEN_MINT  = process.env.TOKEN_MINT  || 'GLQbyKvvQbHf5RXPv8YbK2eqLBAXZ2ZmP3iZNduSpump';
const HELIUS_KEY  = process.env.HELIUS_KEY  || 'b9ba80de-9e4f-44b8-b333-572a6b7f5674';
const POLL_MS     = 12000; // check every 12 seconds

const DEXSCREENER = 'https://dexscreener.com/solana/gr9mcynq3patl5cn5ow7y1tchfgxwjg5cknpyrfkyt25';
const PUMPFUN     = 'https://pump.fun/coin/GLQbyKvvQbHf5RXPv8YbK2eqLBAXZ2ZmP3iZNduSpump';

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

let lastSig = null;

function shortWallet(addr) {
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

function getBuySize(sol) {
  if (sol >= 1)    return '🐳';
  if (sol >= 0.5)  return '🦈';
  if (sol >= 0.1)  return '🐬';
  return '🐟';
}

async function fetchRecentBuys() {
  try {
    const url = `https://api.helius.xyz/v0/addresses/${TOKEN_MINT}/transactions?api-key=${HELIUS_KEY}&limit=10&type=SWAP`;
    const { data: txs } = await axios.get(url);

    if (!txs || txs.length === 0) return;

    // Find new txs since lastSig
    const newTxs = [];
    for (const tx of txs) {
      if (tx.signature === lastSig) break;
      newTxs.push(tx);
    }
    if (newTxs.length === 0) return;

    // Update cursor
    lastSig = txs[0].signature;

    // Process in chronological order
    for (const tx of newTxs.reverse()) {
      try {
        // Find token transfers to a non-program wallet (the buyer)
        const tokenTransfers = tx.tokenTransfers || [];
        const nativeTransfers = tx.nativeTransfers || [];

        // Find $JUAN received by buyer
        const juanReceived = tokenTransfers.find(t =>
          t.mint === TOKEN_MINT && parseFloat(t.tokenAmount) > 0
        );
        if (!juanReceived) continue;

        const buyer = juanReceived.toUserAccount;

        // Find SOL spent by buyer
        const solSpent = nativeTransfers
          .filter(t => t.fromUserAccount === buyer)
          .reduce((sum, t) => sum + t.amount, 0) / 1e9;

        if (solSpent <= 0) continue;

        const juanAmount = parseFloat(juanReceived.tokenAmount).toLocaleString(undefined, { maximumFractionDigits: 0 });
        const emoji = getBuySize(solSpent);

        const msg =
`${emoji} *New Buy!*

💰 *${solSpent.toFixed(3)} SOL*
🌮 *${juanAmount} \\$JUAN*
👛 [${shortWallet(buyer)}](https://solscan.io/account/${buyer})

[📊 Chart](${DEXSCREENER}) \\| [🌮 Buy](${PUMPFUN}) \\| [🌐 Site](https://usdjuan.xyz)`;

        await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'MarkdownV2', disable_web_page_preview: true });
        console.log(`Posted buy: ${solSpent.toFixed(3)} SOL from ${shortWallet(buyer)}`);

      } catch (e) {
        console.error('Error processing tx:', e.message);
      }
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}

// Initialize lastSig to current tip so we don't spam old buys on start
async function init() {
  try {
    const url = `https://api.helius.xyz/v0/addresses/${TOKEN_MINT}/transactions?api-key=${HELIUS_KEY}&limit=1&type=SWAP`;
    const { data } = await axios.get(url);
    if (data && data.length > 0) lastSig = data[0].signature;
    console.log(`Bot started. Watching ${TOKEN_MINT}`);
    console.log(`Last sig: ${lastSig}`);
  } catch (e) {
    console.error('Init error:', e.message);
  }
  setInterval(fetchRecentBuys, POLL_MS);
}

init();

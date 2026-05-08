import {
  type Account,
  type Address,
  type Chain,
  erc20Abi,
  formatUnits,
  type Transport,
  type WalletClient,
} from "viem";
import { readContract } from "viem/actions";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

interface LiquidationAlert {
  logTag: string;
  user: Address;
  marketId: string;
  txHash: string;
  loanToken: Address;
  balanceBefore: bigint;
  client: WalletClient<Transport, Chain, Account>;
}

async function send(message: string) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch {
    // silent
  }
}

/**
 * Fire-and-forget: reads on-chain balance to compute reward, then sends Telegram alert.
 */
export async function sendLiquidationAlert(alert: LiquidationAlert) {
  const { logTag, user, marketId, txHash, loanToken, balanceBefore, client } = alert;

  let rewardStr = "";
  try {
    const [balanceAfter, decimals, symbol] = await Promise.all([
      readContract(client, {
        address: loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [client.account.address],
      }),
      readContract(client, { address: loanToken, abi: erc20Abi, functionName: "decimals" }),
      readContract(client, { address: loanToken, abi: erc20Abi, functionName: "symbol" }),
    ]);
    const profit = balanceAfter - balanceBefore;
    if (profit > 0n) {
      rewardStr = `\nreward: ${parseFloat(formatUnits(profit, decimals)).toFixed(6)} ${symbol}`;
    }
  } catch {
    // skip
  }

  await send(`✅ ${logTag}Liquidated ${user} on ${marketId}${rewardStr}\ntx: ${txHash}`);
}

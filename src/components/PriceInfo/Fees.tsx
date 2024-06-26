import React from 'react';

import { QuoteResponse, SwapMode } from '@jup-ag/react-hook';
import Decimal from 'decimal.js';
import { useTokenContext } from 'src/contexts/TokenContextProvider';
import { formatNumber } from 'src/misc/utils';

interface IFees {
  routePlan: QuoteResponse['routePlan'] | undefined;
  swapMode: SwapMode | undefined;
}

const Fees = ({ routePlan }: IFees) => {
  const { getTokenInfo } = useTokenContext();

  if (!routePlan || (routePlan && routePlan.length === 0)) {
    return null;
  }

  return (
    <>
      {routePlan.map((item, idx) => {
        const tokenMint = getTokenInfo(item.swapInfo.feeMint.toString());
        const decimals = tokenMint?.decimals ?? 6;

        const feeAmount = formatNumber.format(
          new Decimal(item.swapInfo.feeAmount.toString()).div(Math.pow(10, decimals)).toNumber(),
        );
        const feePct = new Decimal(item.swapInfo.feeAmount.toString())
          .div(
            new Decimal(
              item.swapInfo.inputMint.toString() === item.swapInfo.feeMint.toString()
                ? item.swapInfo.inAmount.toString()
                : item.swapInfo.outAmount.toString(),
            ),
          )
          .toDP(4);
        return (
          <div key={idx} className="flex items-center space-x-4 justify-between text-xs">
            <div className="text-white/30">
              <span>
                <span>
                  Fees paid to <span translate="no">{item.swapInfo.label}</span> LP
                </span>
              </span>
            </div>
            <div className="text-white/30 text-right">
              {feeAmount} {tokenMint?.symbol} ({formatNumber.format(new Decimal(feePct).mul(100).toNumber())}
              %)
            </div>
          </div>
        );
      })}
    </>
  );
};

export default Fees;

import { QuoteResponse } from '@jup-ag/react-hook';
import { TokenInfo } from '@solana/spl-token-registry';
import { SystemProgram } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { useMemo } from 'react';
import { DCA_HIGH_PRICE_IMPACT, JLP_MINT, USDC_MINT, USDT_MINT } from 'src/constants';
import { useUSDValue } from 'src/contexts/USDValueProvider';
import { checkIsUnknownToken } from 'src/misc/tokenTags';
import { AuthorityAndDelegatesSuggestion } from '../Tags/AuthorityAndDelegatesSuggestion';
import { DCASuggestion } from '../Tags/DCASuggestion';
import PriceImpactWarningSuggestion from '../Tags/PriceImpactWarningSuggestion';
import { TransferTaxSuggestion } from '../Tags/TransferTaxSuggestion';
import { UnknownTokenSuggestion } from '../Tags/UnknownTokenSuggestion';
import { extractTokenExtensionsInfo } from './extractTokenExtensionsInfo';
import { usePriceImpact } from './usePriceImpact';
import useQueryTokenMetadata from './useQueryTokenMetadata';
import { useBirdeyeRouteInfo } from './useSwapInfo';

const HIGH_PRICE_IMPACT = 5; // 5%
const MINIMUM_THRESHOLD_FOR_DCA = 1_000; // 1,000 USD, not USDC
const HIGH_PRICE_DIFFERENCE = 5; // 5%

const FREEZE_AUTHORITY_IGNORE_LIST = [USDC_MINT.toString(), USDT_MINT.toString(), JLP_MINT.toString()];

export const useSuggestionTags = ({
  fromTokenInfo,
  toTokenInfo,
  quoteResponse,
}: {
  fromTokenInfo: TokenInfo | null | undefined;
  toTokenInfo: TokenInfo | null | undefined;
  quoteResponse: QuoteResponse | undefined;
}) => {
  const { data: tokenMetadata } = useQueryTokenMetadata({ fromTokenInfo, toTokenInfo });
  const birdeyeInfo = useBirdeyeRouteInfo();
  const { tokenPriceMap } = useUSDValue();
  const { priceImpactPct } = usePriceImpact(quoteResponse);

  const listOfSuggestions = useMemo(() => {
    const list: {
      fromToken: JSX.Element[];
      toToken: JSX.Element[];
      additional: JSX.Element[];
    } = {
      fromToken: [],
      toToken: [],
      additional: [],
    };

    if (fromTokenInfo) {
      // is unknown
      if (checkIsUnknownToken(fromTokenInfo)) {
        list.fromToken.push(
          <UnknownTokenSuggestion key={'unknown' + fromTokenInfo.address} tokenInfo={fromTokenInfo} />,
        );
      }
    }

    if (toTokenInfo) {
      // is unknown
      if (checkIsUnknownToken(toTokenInfo)) {
        list.toToken.push(<UnknownTokenSuggestion key={'unknown' + toTokenInfo.address} tokenInfo={toTokenInfo} />);
      }
    }

    // Freeze authority, Permanent delegate, Transfer Tax
    if (tokenMetadata && fromTokenInfo && toTokenInfo) {
      const tokenExt1 = tokenMetadata[0] ? extractTokenExtensionsInfo(tokenMetadata[0]) : undefined;
      const tokenExt2 = tokenMetadata[1] ? extractTokenExtensionsInfo(tokenMetadata[1]) : undefined;

      // Freeze authority, Permanent delegate
      const freeze: TokenInfo[] = [];
      const permanent: TokenInfo[] = [];

      if (
        tokenExt1?.freezeAuthority &&
        FREEZE_AUTHORITY_IGNORE_LIST.includes(fromTokenInfo.address) === false && // Ignore bluechip like, USDC, USDT
        (tokenExt1.freezeAuthority === SystemProgram.programId.toString()) === false // Ignore system program
      ) {
        freeze.push(fromTokenInfo); // Only mark non-strict token, so USDC, USDT, don't get marked
      }

      if (tokenExt1?.permanentDelegate) {
        permanent.push(fromTokenInfo);
      }

      if (
        tokenExt2?.freezeAuthority &&
        FREEZE_AUTHORITY_IGNORE_LIST.includes(toTokenInfo.address) === false && // Ignore bluechip like, USDC, USDT
        (tokenExt2.freezeAuthority === SystemProgram.programId.toString()) === false // Ignore system program
      ) {
        freeze.push(toTokenInfo); // Only mark non-strict token, so USDC, USDT, don't get marked
      }
      if (tokenExt2?.permanentDelegate) {
        permanent.push(toTokenInfo);
      }

      if (freeze.length > 0 || permanent.length > 0) {
        list.additional.push(
          <AuthorityAndDelegatesSuggestion key={`additional-suggestions`} freeze={freeze} permanent={permanent} />,
        );
      }

      // Transfer Tax
      tokenExt1?.transferFee &&
        list.additional.push(
          <TransferTaxSuggestion
            key={'2022' + fromTokenInfo.address}
            asset={tokenMetadata[0]}
            transferFee={tokenExt1.transferFee}
          />,
        );
      tokenExt2?.transferFee &&
        list.additional.push(
          <TransferTaxSuggestion
            key={'transfer-tax-' + toTokenInfo.address}
            asset={tokenMetadata[1]}
            transferFee={tokenExt2.transferFee}
          />,
        );
    }

    // Additional suggestion
    const isHighPriceImpact = priceImpactPct.gt(HIGH_PRICE_IMPACT);
    const isHighPriceDifference = new Decimal(birdeyeInfo.percent).gte(HIGH_PRICE_DIFFERENCE);

    if (quoteResponse && fromTokenInfo && toTokenInfo) {
      if (isHighPriceImpact || isHighPriceDifference) {
        list.additional.unshift(
          <PriceImpactWarningSuggestion
            quoteResponse={quoteResponse}
            birdeyeRate={birdeyeInfo.rate}
            isHighPriceImpact={isHighPriceImpact}
            priceDifferencePct={birdeyeInfo.percent}
            isWarning={birdeyeInfo.isWarning}
            isDanger={birdeyeInfo.isDanger}
            fromTokenInfo={fromTokenInfo}
            toTokenInfo={toTokenInfo}
          />,
        );
      }
    }

    if (quoteResponse && fromTokenInfo && toTokenInfo) {
      const isDCASuggested = (() => {
        const inputTokenPrice = tokenPriceMap[fromTokenInfo?.address || '']?.usd || 0;
        const inputAmountInUSD = new Decimal(quoteResponse.inAmount.toString())
          .div(10 ** fromTokenInfo.decimals)
          .mul(inputTokenPrice);
        const isAboveThreshold = inputAmountInUSD.gte(MINIMUM_THRESHOLD_FOR_DCA);

        return isAboveThreshold && priceImpactPct.gt(DCA_HIGH_PRICE_IMPACT);
      })();

      if (isDCASuggested) {
        list.additional.push(
          <DCASuggestion
            key={'dca-' + fromTokenInfo?.address + toTokenInfo?.address}
            inAmountDecimal={new Decimal(quoteResponse.inAmount.toString())
              .div(10 ** fromTokenInfo.decimals)
              .toString()}
            fromTokenInfo={fromTokenInfo}
            toTokenInfo={toTokenInfo}
          />,
        );
      }
    }

    return list;
  }, [
    birdeyeInfo.isDanger,
    birdeyeInfo.isWarning,
    birdeyeInfo.percent,
    birdeyeInfo.rate,
    fromTokenInfo,
    priceImpactPct,
    quoteResponse,
    toTokenInfo,
    tokenMetadata,
    tokenPriceMap,
  ]);

  return listOfSuggestions;
};

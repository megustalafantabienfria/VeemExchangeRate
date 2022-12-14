import type { Request as ExpressRequest, Response } from 'express';
import { httpErrorHandler } from '@libs/error-handler';
import axios, { AxiosError } from 'axios';
import { logger } from '../../libs/logs';
import { randomUUID } from 'crypto';

type Body = {
  eventType?: 'SET_WEBHOOK';
  update_id: string;
  message: {
    message_id: number;
    from: {
      id: number;
      is_boot: boolean;
      first_name: string;
      language_code: string;
    };
    chat: {
      id: number;
      first_name: string;
      type: string;
    };
    date: number;
    text: string;
    entities: { offset: string; length: string; type: string }[];
  };
};

type Request = ExpressRequest<Record<string, string>, void, Body>;

const regex =
  /^\/quote (?<currencyFrom>\w+) (?<countryDestination>\w+) (?<currencyDestination>\w+) (?<quantity>\d+\.?\d?)$/gm;

export const handleEvents = httpErrorHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (req.body.eventType === 'SET_WEBHOOK') {
      try {
        await axios.get(
          `https://api.telegram.org/bot${process.env.telegramToken}/setWebhook`,
          {
            data: {
              url: 'https://us-central1-veemcurrencyquote.cloudfunctions.net/uOKaO6RG9JHPgvM4xI0UYQ',
            },
          }
        );

        res.status(200).send({ message: 'Webhook set' });
      } catch (error) {
        logger.log({ message: JSON.stringify((error as AxiosError).toJSON()) });
        res.status(500).send({ message: 'Something failed...' });
      }
    }

    const {
      body: {
        message: {
          from: { id: chat_id },
          text: message,
        },
      },
    } = req;

    logger.log({ message: JSON.stringify(req.body) });

    const parsedMessage = message
      .replaceAll(
        regex,
        (_, currencyFrom, countryDestination, countryCurrency, quantity) =>
          [currencyFrom, countryDestination, countryCurrency, quantity].join()
      )
      .split(',');

    console.log(parsedMessage);

    if (parsedMessage.length > 1) {
      const [fromCurrency, toCountry, toCurrency, fromAmount] = parsedMessage;

      let messageToSend;

      try {
        const { data } = await axios.post(
          'https://sandbox-api.veem.com/veem/v1.1/exchangerates/quotes',
          { fromAmount, fromCurrency, toCountry, toCurrency },
          {
            headers: {
              authorization: `Bearer ${process.env.veemToken}`,
              'X-REQUEST-ID': randomUUID(),
            },
          }
        );

        messageToSend = `${data.toAmount} ${toCurrency} @ ${data.rate}`;
      } catch (error) {
        await axios.post(
          `https://api.telegram.org/bot${process.env.telegramToken}/sendMessage`,
          {
            chat_id,
            text: 'Something went wrong at fetching info to veem...',
          }
        );
        res.status(200).send({ message: 'Handled but something happened...' });
      }

      console.log(messageToSend);
      if (messageToSend) {
        try {
          await axios.post(
            `https://api.telegram.org/bot${process.env.telegramToken}/sendMessage`,
            {
              chat_id,
              text: messageToSend,
            }
          );
          res.status(200).send({ message: 'Handled!' });
        } catch (error) {
          // console.log((error as AxiosError).toJSON());
          // logger.log({ message: JSON.stringify((error as AxiosError).toJSON()) });
          res.status(500).send({ message: 'Something failed...' });
        }
      }
    } else {
      try {
        await axios.post(
          `https://api.telegram.org/bot${process.env.telegramToken}/sendMessage`,
          {
            chat_id,
            text: `Didn't understand your message.
            Try sending your message in a format like /quote {currencyFrom} {countryDestination} {currencyDestination} {quantity}`,
          }
        );

        res.status(200).send({ message: 'Invalid action to handle' });
      } catch (error) {
        logger.log({ message: JSON.stringify((error as AxiosError).toJSON()) });
        res.status(500).send({ message: 'Something failed...' });
      }
    }
  }
);

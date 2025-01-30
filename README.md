# Unifai Transaction Builder

Build unsigned transactions for users to sign and submit. Often used by Unifai toolkits.

To build or use toolkits, check out our SDKs:

- [JavaScript/TypeScript SDK](https://github.com/unifai-network/unifai-sdk-js)
- [Python SDK](https://github.com/unifai-network/unifai-sdk-py)

Check out [unifai-toolkits](https://github.com/unifai-network/unifai-toolkits) for official toolkits.

## Local Development

Copy `.env.local.example` to `.env.local` and fill in the `DATABASE_URL` with your local postgres URL starting with `postgresql://`.

Start the server locally:

```bash
npm i
npm start
```

To create a transaction, run the following command in another terminal:

```bash
curl -X POST http://127.0.0.1:8001/api/tx/create \
     -H "Content-Type: application/json" \
     -d '{
           "type": "xxx",
           "payload": {"xxx": "xxx"}
         }'
```

with your actual handler type and payload. You should get a message with a URL to approve the transaction in browser.

## Contributing

We welcome contributions! Here's how you can help:

1. Create your handler in the `src/handlers` directory
2. Submit a Pull Request with:
   - Transaction in blockchain explorer created by your handler
   - Any known limitations or requirements

Your handler should be:
- Self-contained and independent
- Well-tested with major LLM providers
- Following best practices for code quality

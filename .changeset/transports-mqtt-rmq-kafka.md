---
'@idevconn/create-icore': minor
---

Add MQTT, RabbitMQ (rmq) and Kafka as microservice transport options, alongside the existing tcp / redis / nats.

- `--transport=mqtt|rmq|kafka` (and the interactive picker) now scaffold the matching `*_TRANSPORT` value, uncomment the right broker vars in every `.env` (`*_MQTT_URL`; `*_RMQ_URL` + `*_RMQ_QUEUE`; `*_KAFKA_BROKERS` + `*_KAFKA_CLIENT_ID`), and add the driver dep (`mqtt`; `amqplib` + `amqp-connection-manager`; `kafkajs`) to the generated `package.json`.
- `buildTransport()` gained the three cases with the same crash-resilience contract as redis/nats: the broker driver reconnects in the background and a broker that's down on boot is caught by `bootstrapMicroservice()` (banner + retry in dev, fail-fast in prod) instead of exiting.
- All six are message-pattern transports, so `@MessagePattern` controllers and `ClientProxy.send/emit` work unchanged. **gRPC is intentionally not offered** — it requires `.proto` contracts + `@GrpcMethod` + `ClientGrpc`, which is incompatible with the message-based gateway↔MS layer (tracked as a separate epic).

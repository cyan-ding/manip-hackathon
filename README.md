# VexREINFORCE

End to end tool to ensure your domain-specific fine tuned LLM is secure from manipulative influences (evilness, sycophancy, hallucination)
- Utilize persona vectors to insure the dataset, training, and inference of your model is production ready. 

## Dataset Screening

Before training, load in your SFT dataset to test against persona vectors for malicious direction

### How it works

1. We take your prompt-answer pairs run a forward pass on your model
2. project the hidden states onto the persona vector
3. Adds the projection score as a new field in your dataset so you can see how malicious each training sample is

## Training-time Steering

Because inference time steering can degrade some of the gains from domain-specific fine tuning, we introduce training-time steering

### How it works

1. During supervised fine tuning, the persona vectors are added to the activations of the model
2. If the sample's response was already malicious, the added bias will prevent weight updates toward the malicious direction
3. If the sample's response was normal, the loss from the bias will cause the model to learn against the malicious direction

At the end, you will have a fine tuned model that maintains performance and is now innately steered away from a certain trait

## Inference-time Steering

Generate persona vectors from your open source model to steer it away from malicious behaviors

### How it works

1. We first do rollouts with system prompts to generate good vs malicious responses
2. We take those prompt + response pairs and run forward passes on the model
3. We compute the final vectors (one per layer) by averaging across the activations across all response tokens
4. We take the computed persona vector and inject it into any layer of the model during inference to steer it


### References

This project makes use of [Anthropic's persona vectors](https://github.com/safety-research/persona_vectors).
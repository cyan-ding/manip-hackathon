# VexREINFORCE

End to end web app that allows for easy identification of persona vectors in the field of AI manipulation
- Enter an open source model and VexREINFORCE will produce the persona vectors to steer your model away from bad behavior
- Vectors exist for evil, sycophancy, etc. 

## Dataset Screening

Before training, load in your SFT dataset to test against persona vectors for malicious direction

### How it works

1. We take your prompt-answer pairs run a forward pass on your model
2. project the hidden states onto the persona vector
3. Adds the projection score as a new field in your dataset so you can see how malicious each training sample is

## Inference-time Steering

Generate persona vectors from your open source model to steer it away from malicious behaviors

### How it works

1. We first do rollouts with system prompts to generate good vs malicious responses
2. We take those prompt + response pairs and run forward passes on the model
3. We compute the final vectors (one per layer) by averaging across the activations across all response tokens
4. We take the computed persona vector and inject it into any layer of the model during inference to steer it


## Training-time Steering

Because inference time steering can degrade some of the gains from domain-specific fine tuning, we introduce training-time steering

### How it works

1. During supervised fine tuning, the persona vectors are added to the activations of the model
2. If the sample's response was already malicious, the added bias will prevent weight updates toward the malicious direction
3. If the sample's response was normal, the loss from the bias will cause the model to learn against the malicious direction

At the end, you will have a fine tuned model that maintains performance and is now innately steered away from a certain trait
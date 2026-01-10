1#!/bin/bash
# Convert all persona vectors to GGUF format

PERSONA_VECTORS_DIR="persona_vectors/persona_vectors"
OUTPUT_DIR="vectors"

# Create output directory
mkdir -p $OUTPUT_DIR

# Find all .pt files and convert them
for pt_file in $(find $PERSONA_VECTORS_DIR -name "*.pt"); do
    # Extract relative path and trait name
    rel_path=${pt_file#$PERSONA_VECTORS_DIR/}

    # Generate output filename
    # Example: Qwen2.5-7B-Instruct/evil_response_avg_diff.pt -> vectors/Qwen2.5-7B-Instruct_evil_response_avg_diff.gguf
    output_file=$OUTPUT_DIR/$(echo $rel_path | sed 's/\//_/g' | sed 's/\.pt$/.gguf/')

    echo "Converting: $pt_file -> $output_file"
    python convert_persona_to_gguf.py \
        --input "$pt_file" \
        --output "$output_file" \
        --model-type "qwen2.5"

    if [ $? -eq 0 ]; then
        echo "✓ Successfully converted"
    else
        echo "✗ Failed to convert"
    fi
    echo ""
done

echo "Conversion complete! Vectors saved to $OUTPUT_DIR/"

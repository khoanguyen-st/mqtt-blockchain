#!/bin/bash
# Helper script to run commands with devnet environment

# Load devnet environment variables
export $(cat .env.devnet | grep -v "^#" | grep -v "^$" | xargs)

# Run the command passed as arguments
"$@"

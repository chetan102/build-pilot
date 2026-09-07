#!/bin/bash
rm -f .git/index.lock
rm -f .git/index
git reset
git add .
git commit -m "$1"

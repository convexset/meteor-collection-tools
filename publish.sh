#!/bin/bash

CURR_DIR="$(pwd)"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR/packages/collection-tools
meteor publish --update
cd $CURR_DIR